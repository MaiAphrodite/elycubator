package main

import (
    "context"
    "database/sql"
    "encoding/json"
    "log"
    "net/http"
    "strconv"
    "sync"
    "time"

    sqlc "elycubator/db/sqlc"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return originAllowed(r.Header.Get("Origin"), r) },
}

type deviceConn struct {
    conn *websocket.Conn
    mu   sync.Mutex
}

func (d *deviceConn) send(v interface{}) error {
    d.mu.Lock()
    defer d.mu.Unlock()
    d.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
    return d.conn.WriteJSON(v)
}

type liveClient struct {
    conn     *websocket.Conn
    userID   string
    deviceID string
}

var (
    deviceSockets = map[string]*deviceConn{}
    deviceMu      sync.Mutex
    liveClients   = map[*liveClient]struct{}{}
    liveMu        sync.Mutex
)

func pushDeviceSettings(deviceID string, s sqlc.Setting) {
    deviceMu.Lock()
    dc, ok := deviceSockets[deviceID]
    deviceMu.Unlock()
    if ok {
        dc.send(map[string]interface{}{"type": "SETTINGS_UPDATE", "payload": s})
    }
}

func broadcastTelemetry(deviceID string, reading interface{}) {
    frame, err := json.Marshal(map[string]interface{}{"type": "TELEMETRY", "deviceId": deviceID, "data": reading})
    if err != nil {
        return
    }

    liveMu.Lock()
    hasWildcard := false
    for cl := range liveClients {
        if cl.deviceID == "" {
            hasWildcard = true
            break
        }
    }
    liveMu.Unlock()

    owner := ""
    if hasWildcard {
        if d, err := queries.GetDeviceByID(context.Background(), deviceID); err == nil && d.UserID.Valid {
            owner = d.UserID.String
        }
    }

    liveMu.Lock()
    defer liveMu.Unlock()
    for cl := range liveClients {
        if cl.deviceID != "" {
            if cl.deviceID != deviceID {
                continue
            }
        } else if owner == "" || cl.userID != owner {
            continue
        }
        cl.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
        cl.conn.WriteMessage(websocket.TextMessage, frame)
    }
}

// toNum accepts JSON number or string
func toNum(v interface{}) float64 {
    switch x := v.(type) {
    case float64:
        return x
    case string:
        f, _ := strconv.ParseFloat(x, 64)
        return f
    }
    return 0
}

func toNumOrNil(v interface{}) (float64, bool) {
    switch x := v.(type) {
    case float64:
        return x, true
    case string:
        f, err := strconv.ParseFloat(x, 64)
        return f, err == nil
    }
    return 0, false
}

func modeAutoOrNil(v interface{}) (int64, bool) {
    switch x := v.(type) {
    case bool:
        if x {
            return 1, true
        }
        return 0, true
    case float64:
        if x != 0 {
            return 1, true
        }
        return 0, true
    case string:
        switch x {
        case "1", "true":
            return 1, true
        }
        return 0, true
    }
    return 0, false
}

func registerWS(mux *http.ServeMux) {
    mux.HandleFunc("/api/device/stream", hDeviceStream)
    mux.HandleFunc("/api/device/live", hLive)
}

func hDeviceStream(w http.ResponseWriter, r *http.Request) {
    token := r.URL.Query().Get("token")
    claims, err := parseToken(token)
    if err != nil || claims.Type != "device" {
        writeJSON(w, 401, map[string]interface{}{"error": "Invalid device token."})
        return
    }
    device, err := queries.GetDeviceByID(r.Context(), claims.Sub)
    if err != nil || !device.DeviceToken.Valid || device.DeviceToken.String != token {
        writeJSON(w, 401, map[string]interface{}{"error": "Device token revoked."})
        return
    }
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    deviceMu.Lock()
    dc := &deviceConn{conn: conn}
    deviceSockets[device.ID] = dc
    deviceMu.Unlock()
    log.Printf("Device Connected: %s (%s)", device.Nickname.String, device.ID)
    if s, err := queries.GetSettingsByDevice(r.Context(), device.ID); err == nil {
        dc.send(map[string]interface{}{"type": "SETTINGS_UPDATE", "payload": s})
    }
    defer func() {
        deviceMu.Lock()
        delete(deviceSockets, device.ID)
        deviceMu.Unlock()
        log.Printf("Device Disconnected: %s", device.ID)
        conn.Close()
    }()
    for {
        _, msg, err := conn.ReadMessage()
        if err != nil {
            return
        }
        var m map[string]interface{}
        if json.Unmarshal(msg, &m) != nil {
            continue
        }
        if a, ok := m["action"].(string); ok && (a == "start" || a == "stop") {
            handleDeviceAction(device.ID, a)
            continue
        }
        temp := coalesceFloat(m, "temperature", "suhu")
        hum := coalesceFloat(m, "humidity", "hum")
        lamp := coalesceFloat(m, "lampDuty", "dimmer")
        fan := coalesceFloat(m, "fanDuty", "kipas")
        servo := coalesceFloat(m, "servoAngle", "servo_angle")

        queries.InsertTelemetry(r.Context(), sqlc.InsertTelemetryParams{
            ID: newID(), DeviceID: device.ID,
            Temperature: sql.NullFloat64{Float64: temp, Valid: true},
            Humidity:    sql.NullFloat64{Float64: hum, Valid: true},
            LampDuty:    sql.NullFloat64{Float64: lamp, Valid: true},
            FanDuty:     sql.NullFloat64{Float64: fan, Valid: true},
            ServoAngle:  sql.NullFloat64{Float64: servo, Valid: true},
        })
        broadcastTelemetry(device.ID, map[string]float64{
            "temperature": temp, "humidity": hum, "lampDuty": lamp, "fanDuty": fan, "servoAngle": servo,
        })

        s, err := queries.GetSettingsByDevice(r.Context(), device.ID)
        if err != nil {
            s, _ = queries.CreateSettings(r.Context(), sqlc.CreateSettingsParams{ID: newID(), DeviceID: device.ID})
        }
        if v, ok := toNumOrNil(m["target_suhu_set"]); ok {
            s.TargetTempSet = v
        }
        if v, ok := toNumOrNil(m["target_suhu_hatch"]); ok {
            s.TargetTempHatch = v
        }
        if v, ok := toNumOrNil(m["kp_set"]); ok {
            s.SetKp = v
        }
        if v, ok := toNumOrNil(m["ki_set"]); ok {
            s.SetKi = v
        }
        if v, ok := toNumOrNil(m["kd_set"]); ok {
            s.SetKd = v
        }
        if v, ok := toNumOrNil(m["kp_hatch"]); ok {
            s.HatchKp = v
        }
        if v, ok := toNumOrNil(m["ki_hatch"]); ok {
            s.HatchKi = v
        }
        if v, ok := toNumOrNil(m["kd_hatch"]); ok {
            s.HatchKd = v
        }
        if v, ok := modeAutoOrNil(m["mode_auto"]); ok {
            s.ModeAuto = v
        }

        day := liveDayCount(s)
        profile := activeProfile(s, day)
        kipas := fanState(hum, temp, profile.targetTemp, s.Kipas)
        s.DayCount = day
        s.TargetTemp = profile.targetTemp
        s.TempKp, s.TempKi, s.TempKd = profile.kp, profile.ki, profile.kd
        s.Kipas = kipas
        s.TurnerTest = 0
        queries.UpdateSettings(r.Context(), settingsToParams(s))
        dc.send(map[string]interface{}{
            "type": "CONTROL",
            "payload": map[string]interface{}{
                "kipas": kipas, "target_suhu": profile.targetTemp, "mode_auto": s.ModeAuto,
                "hari_ke": day, "turner_test": s.TurnerTest,
                "kp": profile.kp, "ki": profile.ki, "kd": profile.kd,
            },
        })
    }
}

func coalesceFloat(m map[string]interface{}, keys ...string) float64 {
    for _, k := range keys {
        if v, ok := m[k]; ok {
            return toNum(v)
        }
    }
    return 0
}

func handleDeviceAction(deviceID, action string) {
    s, err := queries.GetSettingsByDevice(context.Background(), deviceID)
    if err != nil {
        return
    }
    if action == "start" {
        s.DayCount = 1
        s.StartedAt = sql.NullString{String: nowRFC(), Valid: true}
    }
    if action == "stop" {
        s.DayCount = 0
        s.StartedAt = sql.NullString{}
        s.Kipas = 0
    }
    queries.UpdateSettings(context.Background(), settingsToParams(s))
    pushDeviceSettings(deviceID, s)
}

func hLive(w http.ResponseWriter, r *http.Request) {
    token := r.URL.Query().Get("token")
    claims, err := parseToken(token)
    if err != nil || claims.Type != "user" {
        writeJSON(w, 401, map[string]interface{}{"error": "Invalid user token."})
        return
    }
    target := r.URL.Query().Get("deviceId")
    if target != "" {
        if _, allowed := requireOwnedDevice(w, r, claims, target); !allowed {
            return
        }
    }
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    client := &liveClient{conn: conn, userID: claims.Sub, deviceID: target}
    liveMu.Lock()
    liveClients[client] = struct{}{}
    liveMu.Unlock()
    log.Printf("Web client subscribed: user=%s device=%s", claims.Sub, target)
    defer func() {
        liveMu.Lock()
        delete(liveClients, client)
        liveMu.Unlock()
        conn.Close()
    }()
    for {
        if _, _, err := conn.ReadMessage(); err != nil {
            return
        }
    }
}
