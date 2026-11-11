package main

import (
    "database/sql"
    "encoding/json"
    "net/http"
)

func registerIncubation(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/device/{deviceId}/incubation", hGetIncubation)
    mux.HandleFunc("POST /api/device/{deviceId}/incubation/start", hIncubationStart)
    mux.HandleFunc("POST /api/device/{deviceId}/incubation/stop", hIncubationStop)
    mux.HandleFunc("POST /api/device/{deviceId}/incubation/mode", hIncubationMode)
    mux.HandleFunc("POST /api/device/{deviceId}/incubation/test-turner", hIncubationTestTurner)
    mux.HandleFunc("PUT /api/device/{deviceId}/incubation/profiles", hIncubationProfiles)
}

func hGetIncubation(w http.ResponseWriter, r *http.Request) {
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
    ok(w, incubationView(s))
}

func hIncubationStart(w http.ResponseWriter, r *http.Request) {
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
    s.DayCount = 1
    s.StartedAt = sql.NullString{String: nowRFC(), Valid: true}
    queries.UpdateSettings(r.Context(), settingsToParams(s))
    s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
    pushDeviceSettings(deviceID, s2)
    ok(w, incubationView(s2))
}

func hIncubationStop(w http.ResponseWriter, r *http.Request) {
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
    s.DayCount = 0
    s.StartedAt = sql.NullString{}
    s.Kipas = 0
    queries.UpdateSettings(r.Context(), settingsToParams(s))
    s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
    pushDeviceSettings(deviceID, s2)
    ok(w, incubationView(s2))
}

func hIncubationMode(w http.ResponseWriter, r *http.Request) {
    c := requireUser(w, r)
    if c == nil {
        return
    }
    deviceID, allowed := requireOwnedPathDevice(w, r, c)
    if !allowed {
        return
    }
    var body struct {
        Val bool `json:"val"`
    }
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        fail(w, 400, "Invalid request body.")
        return
    }
    s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
    if err != nil {
        fail(w, 404, "Settings not found.")
        return
    }
    s.ModeAuto = boolToInt(body.Val)
    queries.UpdateSettings(r.Context(), settingsToParams(s))
    s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
    pushDeviceSettings(deviceID, s2)
    ok(w, incubationView(s2))
}

func hIncubationTestTurner(w http.ResponseWriter, r *http.Request) {
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
    s.TurnerTest = 1
    queries.UpdateSettings(r.Context(), settingsToParams(s))
    s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
    pushDeviceSettings(deviceID, s2)
    ok(w, incubationView(s2))
}

func hIncubationProfiles(w http.ResponseWriter, r *http.Request) {
    c := requireUser(w, r)
    if c == nil {
        return
    }
    deviceID, allowed := requireOwnedPathDevice(w, r, c)
    if !allowed {
        return
    }
    var body struct {
        Tss *float64 `json:"tss"`
        Tsh *float64 `json:"tsh"`
        Kps *float64 `json:"kps"`
        Kis *float64 `json:"kis"`
        Kds *float64 `json:"kds"`
        Kph *float64 `json:"kph"`
        Kih *float64 `json:"kih"`
        Kdh *float64 `json:"kdh"`
    }
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        fail(w, 400, "Invalid request body.")
        return
    }
    s, err := queries.GetSettingsByDevice(r.Context(), deviceID)
    if err != nil {
        fail(w, 404, "Settings not found.")
        return
    }
    if body.Tss != nil {
        s.TargetTempSet = *body.Tss
    }
    if body.Tsh != nil {
        s.TargetTempHatch = *body.Tsh
    }
    if body.Kps != nil {
        s.SetKp = *body.Kps
    }
    if body.Kis != nil {
        s.SetKi = *body.Kis
    }
    if body.Kds != nil {
        s.SetKd = *body.Kds
    }
    if body.Kph != nil {
        s.HatchKp = *body.Kph
    }
    if body.Kih != nil {
        s.HatchKi = *body.Kih
    }
    if body.Kdh != nil {
        s.HatchKd = *body.Kdh
    }
    day := liveDayCount(s)
    if day > 0 {
        p := activeProfile(s, day)
        s.TargetTemp = p.targetTemp
        s.TempKp, s.TempKi, s.TempKd = p.kp, p.ki, p.kd
    }
    queries.UpdateSettings(r.Context(), settingsToParams(s))
    s2, _ := queries.GetSettingsByDevice(r.Context(), deviceID)
    pushDeviceSettings(deviceID, s2)
    ok(w, incubationView(s2))
}
