package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	sqlc "elycubator/db/sqlc"
)

func registerDevice(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/device/init", hDeviceInit)
	mux.HandleFunc("POST /api/device/claim", hDeviceClaim)
	mux.HandleFunc("GET /api/devices", hListMyDevices)
	mux.HandleFunc("GET /api/devices/pending", hListPendingDevices)
	mux.HandleFunc("GET /api/device/{deviceId}/settings", hGetSettings)
	mux.HandleFunc("PUT /api/device/{deviceId}/settings", hPutSettings)
	mux.HandleFunc("POST /api/device/{deviceId}/servo/trigger", hServoTrigger)
}

func hDeviceInit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MacAddress    string `json:"macAddress"`
		PairingPin    string `json:"pairingPin"`
		HmacSignature string `json:"hmacSignature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, 400, "macAddress, pairingPin, hmacSignature required.")
		return
	}
	device, err := queries.GetDeviceByMAC(r.Context(), body.MacAddress)
	secret := deviceSecret
	if err == nil {
		secret = device.DeviceSecret
	}
	expected := body.MacAddress + ":" + body.PairingPin
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(expected))
	if subtle.ConstantTimeCompare([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(body.HmacSignature)) != 1 {
		fail(w, 401, "HMAC signature verification failed.")
		return
	}
	if err != nil {
		// new device
		d, err := queries.CreateDevice(r.Context(), sqlc.CreateDeviceParams{ID: newID(), MacAddress: body.MacAddress, PairingCode: sql.NullString{String: body.PairingPin, Valid: true}, DeviceSecret: deviceSecret})
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				fail(w, 409, "Pairing PIN is already in use by another device. Generate a new PIN and retry.")
				return
			}
			fail(w, 500, "create device failed")
			return
		}
		device = d
	} else if device.IsClaimed == 0 {
		if err := queries.UpdateDevicePairing(r.Context(), sqlc.UpdateDevicePairingParams{PairingCode: sql.NullString{String: body.PairingPin, Valid: true}, ID: device.ID}); err != nil {
			fail(w, 500, "store pairing code failed, retry")
			return
		}
	}
	deviceToken, err := signToken(device.ID, "device", "", device.MacAddress, deviceTokenTTL)
	if err != nil {
		fail(w, 500, "token error")
		return
	}
	if err := queries.UpdateDeviceToken(r.Context(), sqlc.UpdateDeviceTokenParams{DeviceToken: sql.NullString{String: deviceToken, Valid: true}, ID: device.ID}); err != nil {
		fail(w, 500, "store device token failed, retry")
		return
	}
	writeJSON(w, 200, map[string]interface{}{
		"success": true, "deviceId": device.ID, "claimed": device.IsClaimed != 0, "deviceToken": deviceToken,
		"message": map[bool]string{true: "Device already claimed. New session token issued.", false: "Device registered and awaiting claim."}[device.IsClaimed != 0],
	})
}

func hDeviceClaim(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	var body struct {
		MacAddress string `json:"macAddress"`
		PairingPin string `json:"pairingPin"`
		Nickname   string `json:"nickname"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, 400, "Invalid request body.")
		return
	}
	body.MacAddress = strings.TrimSpace(body.MacAddress)
	body.PairingPin = strings.TrimSpace(body.PairingPin)
	if body.MacAddress == "" && body.PairingPin == "" {
		fail(w, 400, "pairingPin or macAddress is required.")
		return
	}
	device, err := findDevice(r, body.MacAddress, body.PairingPin)
	if err != nil {
		fail(w, 404, "No device matches that PIN or MAC address.")
		return
	}
	if device.IsClaimed != 0 {
		fail(w, 400, "Device is already claimed.")
		return
	}
	if body.PairingPin != "" && (!device.PairingCode.Valid || device.PairingCode.String != body.PairingPin) {
		fail(w, 401, "Invalid Pairing PIN.")
		return
	}
	nickname := body.Nickname
	if nickname == "" {
		nickname = defaultNickname(device.MacAddress)
	}
	queries.ClaimDevice(r.Context(), sqlc.ClaimDeviceParams{Nickname: sql.NullString{String: nickname, Valid: true}, UserID: sql.NullString{String: c.Sub, Valid: true}, ID: device.ID})
	if _, err := queries.GetSettingsByDevice(r.Context(), device.ID); err != nil {
		queries.CreateSettings(r.Context(), sqlc.CreateSettingsParams{ID: newID(), DeviceID: device.ID})
	}
	ok(w, deviceJSON(device))
}

func hListMyDevices(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	devices, err := queries.GetDevicesByUser(r.Context(), sql.NullString{String: c.Sub, Valid: true})
	if err != nil {
		fail(w, 500, "db error")
		return
	}
	out := make([]map[string]interface{}, 0, len(devices))
	for _, d := range devices {
		out = append(out, deviceJSON(d))
	}
	ok(w, out)
}

func hListPendingDevices(w http.ResponseWriter, r *http.Request) {
	if c := requireUser(w, r); c == nil {
		return
	}
	devices, err := queries.GetPendingDevices(r.Context())
	if err != nil {
		fail(w, 500, "db error")
		return
	}
	out := make([]map[string]interface{}, 0, len(devices))
	for _, d := range devices {
		out = append(out, map[string]interface{}{"macAddress": d.MacAddress, "createdAt": d.CreatedAt})
	}
	ok(w, out)
}

func findDevice(r *http.Request, macAddress, pairingPin string) (sqlc.Device, error) {
	if macAddress != "" {
		return queries.GetDeviceByMAC(r.Context(), macAddress)
	}
	return queries.GetDeviceByPairingCode(r.Context(), sql.NullString{String: pairingPin, Valid: true})
}

func defaultNickname(macAddress string) string {
	if len(macAddress) >= 5 {
		return "Incubator " + macAddress[len(macAddress)-5:]
	}
	return "Incubator"
}

func deviceJSON(d sqlc.Device) map[string]interface{} {
	return map[string]interface{}{
		"id":         d.ID,
		"macAddress": d.MacAddress,
		"nickname":   nullStr(d.Nickname),
		"claimed":    d.IsClaimed != 0,
		"createdAt":  d.CreatedAt,
	}
}

func hGetSettings(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	deviceID, allowed := requireOwnedPathDevice(w, r, c)
	if !allowed {
		return
	}
	s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
	if err != nil {
		fail(w, 404, "Settings not found for this device.")
		return
	}
	ok(w, s)
}

func hPutSettings(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	deviceID, allowed := requireOwnedPathDevice(w, r, c)
	if !allowed {
		return
	}
	s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
	if err != nil {
		fail(w, 404, "Settings not found for this device.")
		return
	}
	var body struct {
		TargetTemp      *float64 `json:"targetTemp"`
		TargetHumidity  *float64 `json:"targetHumidity"`
		TempKp          *float64 `json:"tempKp"`
		TempKi          *float64 `json:"tempKi"`
		TempKd          *float64 `json:"tempKd"`
		HumidKp         *float64 `json:"humidKp"`
		HumidKi         *float64 `json:"humidKi"`
		HumidKd         *float64 `json:"humidKd"`
		TurnIntervalHrs *int64   `json:"turnIntervalHrs"`
		TurnAngle       *int64   `json:"turnAngle"`
		ServoTrigger    *bool    `json:"servoTrigger"`
		LampEnabled     *bool    `json:"lampEnabled"`
		FanEnabled      *bool    `json:"fanEnabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, 400, "Invalid request body.")
		return
	}
	if body.TargetTemp != nil {
		s.TargetTemp = *body.TargetTemp
	}
	if body.TargetHumidity != nil {
		s.TargetHumidity = *body.TargetHumidity
	}
	if body.TempKp != nil {
		s.TempKp = *body.TempKp
	}
	if body.TempKi != nil {
		s.TempKi = *body.TempKi
	}
	if body.TempKd != nil {
		s.TempKd = *body.TempKd
	}
	if body.HumidKp != nil {
		s.HumidKp = *body.HumidKp
	}
	if body.HumidKi != nil {
		s.HumidKi = *body.HumidKi
	}
	if body.HumidKd != nil {
		s.HumidKd = *body.HumidKd
	}
	if body.TurnIntervalHrs != nil {
		s.TurnIntervalHrs = *body.TurnIntervalHrs
	}
	if body.TurnAngle != nil {
		s.TurnAngle = *body.TurnAngle
	}
	if body.ServoTrigger != nil {
		s.ServoTrigger = boolToInt(*body.ServoTrigger)
	}
	if body.LampEnabled != nil {
		s.LampEnabled = boolToInt(*body.LampEnabled)
	}
	if body.FanEnabled != nil {
		s.FanEnabled = boolToInt(*body.FanEnabled)
	}
	queries.UpdateSettings(r.Context(), settingsToParams(s))
	s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
	pushDeviceSettings(deviceID, s2)
	ok(w, s2)
}

func settingsToParams(s sqlc.Setting) sqlc.UpdateSettingsParams {
	return sqlc.UpdateSettingsParams{
		TargetTemp: s.TargetTemp, TargetHumidity: s.TargetHumidity,
		TempKp: s.TempKp, TempKi: s.TempKi, TempKd: s.TempKd,
		HumidKp: s.HumidKp, HumidKi: s.HumidKi, HumidKd: s.HumidKd,
		TurnIntervalHrs: s.TurnIntervalHrs, TurnAngle: s.TurnAngle, ServoTrigger: s.ServoTrigger,
		LampEnabled: s.LampEnabled, FanEnabled: s.FanEnabled,
		ModeAuto: s.ModeAuto, DayCount: s.DayCount, StartedAt: s.StartedAt,
		TurnerTest: s.TurnerTest, Kipas: s.Kipas,
		TargetTempSet: s.TargetTempSet, TargetTempHatch: s.TargetTempHatch,
		SetKp: s.SetKp, SetKi: s.SetKi, SetKd: s.SetKd,
		HatchKp: s.HatchKp, HatchKi: s.HatchKi, HatchKd: s.HatchKd,
		DeviceID: s.DeviceID,
	}
}

func hServoTrigger(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	deviceID, allowed := requireOwnedPathDevice(w, r, c)
	if !allowed {
		return
	}
	s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
	if err != nil {
		fail(w, 404, "Settings not found.")
		return
	}
	s.ServoTrigger = 1
	s.TurnerTest = 1
	queries.UpdateSettings(r.Context(), settingsToParams(s))
	s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
	pushDeviceSettings(deviceID, s2)
	okMsg(w, "Servo turn triggered.")
}
