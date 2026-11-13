package main

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"log"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	sqlc "elycubator/db/sqlc"
)

// registerAPIPhp exposes the small, token-protected compatibility surface used
// by the legacy HTTP firmware. The newer native device protocol remains the
// preferred path for firmware that supports /api/device/init + WebSocket.
func registerAPIPhp(mux *http.ServeMux) {
	mux.HandleFunc("GET /api.php", hAPIPhp)
}

func hAPIPhp(w http.ResponseWriter, r *http.Request) {
	// If no legacy token is configured, behave as if the route does not exist.
	if legacyAPIToken == "" {
		http.NotFound(w, r)
		return
	}
	provided := r.Header.Get("X-Device-Token")
	if provided == "" {
		provided = r.URL.Query().Get("token")
	}
	if subtle.ConstantTimeCompare([]byte(provided), []byte(legacyAPIToken)) != 1 {
		fail(w, http.StatusUnauthorized, "Invalid device token.")
		return
	}

	q := r.URL.Query()
	action := q.Get("action")
	if action == "" {
		action = "read"
	}

	device, err := resolveLegacyDevice(r, q.Get("deviceId"), q.Get("mac"))
	if err != nil {
		// Legacy firmware identifies itself by MAC and never calls
		// /api/device/init, so auto-create the row on first contact.
		mac := strings.TrimSpace(q.Get("mac"))
		if mac == "" {
			fail(w, http.StatusNotFound, "No matching device registered.")
			return
		}
		device, err = registerLegacyDevice(r, mac)
		if err != nil {
			log.Printf("legacy register failed mac=%s: %v", mac, err)
			fail(w, http.StatusInternalServerError, "register device failed.")
			return
		}
		log.Printf("legacy device registered: mac=%s id=%s pin=%s", mac, device.ID, device.PairingCode.String)
	}
	deviceID := device.ID

	s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
	if err != nil {
		s, err = queries.CreateSettings(r.Context(), sqlc.CreateSettingsParams{ID: newID(), DeviceID: deviceID})
		if err != nil {
			fail(w, http.StatusInternalServerError, "create settings failed")
			return
		}
	}

	if action == "update_esp" {
		suhu := toFloatQ(q.Get("suhu"), s.TargetTemp)
		hum := toFloatQ(q.Get("hum"), s.TargetHumidity)
		dimmer := toFloatQ(q.Get("dimmer"), 0)
		servo := toFloatQ(q.Get("servo"), toFloatQ(q.Get("servo_angle"), 0))
		reportedFan := int64(toFloatQ(q.Get("kipas"), float64(s.Kipas)))
		if reportedFan != 0 {
			reportedFan = 1
		}

		day := liveDayCount(s)
		profile := activeProfile(s, day)

		queries.InsertTelemetry(r.Context(), sqlc.InsertTelemetryParams{
			ID: newID(), DeviceID: deviceID,
			Temperature: sql.NullFloat64{Float64: suhu, Valid: true},
			Humidity:    sql.NullFloat64{Float64: hum, Valid: true},
			LampDuty:    sql.NullFloat64{Float64: dimmer, Valid: true},
			FanDuty:     sql.NullFloat64{Float64: float64(reportedFan) * 100, Valid: true},
			ServoAngle:  sql.NullFloat64{Float64: servo, Valid: true},
		})
		broadcastTelemetry(deviceID, map[string]float64{
			"temperature": suhu, "humidity": hum, "lampDuty": dimmer,
			"fanDuty": float64(reportedFan) * 100, "servoAngle": servo,
		})

		consumedTurnerTest := s.TurnerTest
		if s.ServoTrigger != 0 {
			consumedTurnerTest = 1
			s.ServoTrigger = 0
		}

		// Keep the legacy controller on the same active profile the native
		// protocol uses. The device still owns the actual PID loop.
		s.DayCount = day
		s.TargetTemp = profile.targetTemp
		s.TempKp, s.TempKi, s.TempKd = profile.kp, profile.ki, profile.kd
		s.Kipas = reportedFan
		s.TurnerTest = 0
		if err := queries.UpdateSettings(r.Context(), settingsToParams(s)); err != nil {
			fail(w, http.StatusInternalServerError, "update settings failed")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":      true,
			"kipas":        reportedFan,
			"kipas_manual": s.FanEnabled,
			"fan_test":     0,
			"fan_enabled":  s.FanEnabled,
			"lamp_enabled": s.LampEnabled,
			"target_suhu":  profile.targetTemp,
			"mode_auto":    s.ModeAuto,
			"hari_ke":      day,
			"turner_test":  consumedTurnerTest,
			"kp":           profile.kp,
			"ki":           profile.ki,
			"kd":           profile.kd,
		})
		return
	}

	switch action {
	case "set_mode":
		v, _ := strconv.Atoi(q.Get("val"))
		if v != 0 {
			s.ModeAuto = 1
		} else {
			s.ModeAuto = 0
		}
	case "start":
		s.DayCount = 1
		s.StartedAt = sql.NullString{String: nowRFC(), Valid: true}
	case "stop":
		s.DayCount = 0
		s.StartedAt = sql.NullString{}
		s.Kipas = 0
	case "test_turner":
		s.TurnerTest = 1
	case "set_pid_profil":
		if v := q.Get("tss"); v != "" {
			s.TargetTempSet = toFloatQ(v, s.TargetTempSet)
		}
		if v := q.Get("tsh"); v != "" {
			s.TargetTempHatch = toFloatQ(v, s.TargetTempHatch)
		}
		if v := q.Get("kps"); v != "" {
			s.SetKp = toFloatQ(v, s.SetKp)
		}
		if v := q.Get("kis"); v != "" {
			s.SetKi = toFloatQ(v, s.SetKi)
		}
		if v := q.Get("kds"); v != "" {
			s.SetKd = toFloatQ(v, s.SetKd)
		}
		if v := q.Get("kph"); v != "" {
			s.HatchKp = toFloatQ(v, s.HatchKp)
		}
		if v := q.Get("kih"); v != "" {
			s.HatchKi = toFloatQ(v, s.HatchKi)
		}
		if v := q.Get("kdh"); v != "" {
			s.HatchKd = toFloatQ(v, s.HatchKd)
		}
		if day := liveDayCount(s); day > 0 {
			p := activeProfile(s, day)
			s.TargetTemp = p.targetTemp
			s.TempKp, s.TempKi, s.TempKd = p.kp, p.ki, p.kd
		}
	case "read":
		// fallthrough to response below
	default:
		fail(w, http.StatusBadRequest, "Unknown action.")
		return
	}

	if err := queries.UpdateSettings(r.Context(), settingsToParams(s)); err != nil {
		fail(w, http.StatusInternalServerError, "update settings failed")
		return
	}
	fresh, err := queries.GetSettingsByDevice(r.Context(), deviceID)
	if err != nil {
		fail(w, http.StatusInternalServerError, "read settings failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": incubationView(fresh)})
}

// registerLegacyDevice creates the device row on first contact from a legacy
// (MAC-identifying) firmware so it can be claimed from the dashboard.
func registerLegacyDevice(r *http.Request, mac string) (sqlc.Device, error) {
	pin, err := newPairingPin()
	if err != nil {
		return sqlc.Device{}, err
	}
	device, err := queries.CreateDevice(r.Context(), sqlc.CreateDeviceParams{
		ID:           newID(),
		MacAddress:   mac,
		PairingCode:  sql.NullString{String: pin, Valid: true},
		DeviceSecret: legacyAPIToken,
	})
	if err != nil {
		// A concurrent request may have created it already.
		return queries.GetDeviceByMAC(r.Context(), mac)
	}
	if _, err := queries.GetSettingsByDevice(r.Context(), device.ID); err != nil {
		// New devices must start with the heater disabled.
		created, cerr := queries.CreateSettings(r.Context(), sqlc.CreateSettingsParams{ID: newID(), DeviceID: device.ID})
		if cerr == nil {
			created.LampEnabled = 0
			queries.UpdateSettings(r.Context(), settingsToParams(created))
		}
	}
	return device, nil
}

func newPairingPin() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return strconv.FormatInt(n.Int64()+100000, 10), nil
}

func resolveLegacyDevice(r *http.Request, deviceID, mac string) (sqlc.Device, error) {
	mac = strings.TrimSpace(mac)
	deviceID = strings.TrimSpace(deviceID)
	if deviceID != "" {
		return queries.GetDeviceByID(r.Context(), deviceID)
	}
	if mac != "" {
		return queries.GetDeviceByMAC(r.Context(), mac)
	}
	return queries.GetFirstDevice(r.Context())
}

func toFloatQ(s string, fallback float64) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fallback
	}
	return f
}
