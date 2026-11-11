package main

import (
    "net/http"

    sqlc "elycubator/db/sqlc"
)

func requireOwnedDevice(w http.ResponseWriter, r *http.Request, c *Claims, deviceID string) (sqlc.Device, bool) {
    if deviceID == "" {
        fail(w, http.StatusBadRequest, "deviceId is required.")
        return sqlc.Device{}, false
    }
    d, err := queries.GetDeviceByID(r.Context(), deviceID)
    if err != nil || !d.UserID.Valid || d.UserID.String != c.Sub {
        fail(w, http.StatusNotFound, "Device not found.")
        return sqlc.Device{}, false
    }
    return d, true
}

func requireOwnedPathDevice(w http.ResponseWriter, r *http.Request, c *Claims) (string, bool) {
    id := r.PathValue("deviceId")
    if _, allowed := requireOwnedDevice(w, r, c, id); !allowed {
        return "", false
    }
    return id, true
}
