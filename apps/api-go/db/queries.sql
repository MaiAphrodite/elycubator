-- name: CreateUser :one
INSERT INTO users (id, email, name, password_hash, refresh_token, created_at, updated_at)
VALUES (?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: UpdateUserRefreshToken :exec
UPDATE users SET refresh_token = ?, updated_at = datetime('now') WHERE id = ?;

-- name: CreateDevice :one
INSERT INTO devices (id, mac_address, pairing_code, is_claimed, device_secret, created_at, updated_at)
VALUES (?, ?, ?, 0, ?, datetime('now'), datetime('now'))
RETURNING *;

-- name: GetDeviceByMAC :one
SELECT * FROM devices WHERE mac_address = ?;

-- name: GetDeviceByID :one
SELECT * FROM devices WHERE id = ?;

-- name: GetFirstDevice :one
SELECT * FROM devices ORDER BY created_at ASC LIMIT 1;

-- name: GetDeviceByPairingCode :one
SELECT * FROM devices WHERE pairing_code = ?;

-- name: GetDevicesByUser :many
SELECT * FROM devices WHERE user_id = ? ORDER BY created_at ASC;

-- name: GetPendingDevices :many
SELECT * FROM devices WHERE is_claimed = 0 AND pairing_code IS NOT NULL ORDER BY created_at ASC;

-- name: UpdateDeviceToken :exec
UPDATE devices SET device_token = ?, updated_at = datetime('now') WHERE id = ?;

-- name: UpdateDevicePairing :exec
UPDATE devices SET pairing_code = ?, updated_at = datetime('now') WHERE id = ?;

-- name: ClaimDevice :exec
UPDATE devices SET is_claimed = 1, pairing_code = NULL, nickname = ?, user_id = ?, updated_at = datetime('now')
WHERE id = ?;

-- name: CreateSettings :one
INSERT INTO settings (id, device_id, updated_at)
VALUES (?, ?, datetime('now'))
RETURNING *;

-- name: GetSettingsByDevice :one
SELECT * FROM settings WHERE device_id = ?;

-- name: UpdateSettings :exec
UPDATE settings SET
  target_temp = ?, target_humidity = ?,
  temp_kp = ?, temp_ki = ?, temp_kd = ?,
  humid_kp = ?, humid_ki = ?, humid_kd = ?,
  turn_interval_hrs = ?, turn_angle = ?, servo_trigger = ?,
  lamp_enabled = ?, fan_enabled = ?,
  mode_auto = ?, day_count = ?, started_at = ?, turner_test = ?, kipas = ?,
  target_temp_set = ?, target_temp_hatch = ?,
  set_kp = ?, set_ki = ?, set_kd = ?,
  hatch_kp = ?, hatch_ki = ?, hatch_kd = ?,
  updated_at = datetime('now')
WHERE device_id = ?;

-- name: InsertTelemetry :one
INSERT INTO telemetry (id, device_id, temperature, humidity, lamp_duty, fan_duty, servo_angle, timestamp)
VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
RETURNING *;

-- name: ListTelemetryByDevice :many
SELECT * FROM (
  SELECT * FROM telemetry WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?
) ORDER BY timestamp ASC;
