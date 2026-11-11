package main

import (
    "database/sql"
    "net/http"
    "strconv"

    sqlc "elycubator/db/sqlc"
)

func registerTelemetry(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/telemetry/history/{deviceId}", hTelemetryHistory)
}

func hTelemetryHistory(w http.ResponseWriter, r *http.Request) {
    c := requireUser(w, r)
    if c == nil {
        return
    }
    deviceID, allowed := requireOwnedPathDevice(w, r, c)
    if !allowed {
        return
    }
    limit := int64(50)
    if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
        limit = int64(l)
    }
    if limit > 2000 {
        limit = 2000
    }
    rows, err := queries.ListTelemetryByDevice(r.Context(), sqlc.ListTelemetryByDeviceParams{DeviceID: deviceID, Limit: limit})
    if err != nil {
        fail(w, 500, "db error")
        return
    }
    out := []interface{}{}
    for _, row := range rows {
        out = append(out, map[string]interface{}{
            "id": row.ID, "deviceId": row.DeviceID,
            "temperature": nullFloat(row.Temperature), "humidity": nullFloat(row.Humidity),
            "lampDuty": nullFloat(row.LampDuty), "fanDuty": nullFloat(row.FanDuty),
            "servoAngle": nullFloat(row.ServoAngle), "timestamp": row.Timestamp,
        })
    }
    ok(w, out)
}

func nullFloat(f sql.NullFloat64) interface{} {
    if f.Valid {
        return f.Float64
    }
    return nil
}
