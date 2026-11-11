CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  password_hash TEXT NOT NULL,
  refresh_token TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  mac_address   TEXT NOT NULL UNIQUE,
  pairing_code  TEXT UNIQUE,
  is_claimed    INTEGER NOT NULL DEFAULT 0,
  device_secret TEXT NOT NULL,
  device_token  TEXT,
  nickname      TEXT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  target_temp       REAL NOT NULL DEFAULT 37.8,
  target_humidity   REAL NOT NULL DEFAULT 55.0,
  temp_kp           REAL NOT NULL DEFAULT 25.0,
  temp_ki           REAL NOT NULL DEFAULT 1.0,
  temp_kd           REAL NOT NULL DEFAULT 5.0,
  humid_kp          REAL NOT NULL DEFAULT 1.5,
  humid_ki          REAL NOT NULL DEFAULT 0.3,
  humid_kd          REAL NOT NULL DEFAULT 0.5,
  turn_interval_hrs INTEGER NOT NULL DEFAULT 4,
  turn_angle        INTEGER NOT NULL DEFAULT 90,
  servo_trigger     INTEGER NOT NULL DEFAULT 0,
  lamp_enabled      INTEGER NOT NULL DEFAULT 1,
  fan_enabled       INTEGER NOT NULL DEFAULT 1,
  mode_auto         INTEGER NOT NULL DEFAULT 1,
  day_count         INTEGER NOT NULL DEFAULT 0,
  started_at        TEXT,
  turner_test       INTEGER NOT NULL DEFAULT 0,
  kipas             INTEGER NOT NULL DEFAULT 0,
  target_temp_set   REAL NOT NULL DEFAULT 37.8,
  target_temp_hatch REAL NOT NULL DEFAULT 37.2,
  set_kp            REAL NOT NULL DEFAULT 25.0,
  set_ki            REAL NOT NULL DEFAULT 1.0,
  set_kd            REAL NOT NULL DEFAULT 5.0,
  hatch_kp          REAL NOT NULL DEFAULT 30.0,
  hatch_ki          REAL NOT NULL DEFAULT 1.5,
  hatch_kd          REAL NOT NULL DEFAULT 2.0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telemetry (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  temperature REAL,
  humidity    REAL,
  lamp_duty   REAL,
  fan_duty    REAL,
  servo_angle REAL,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_refresh ON users(refresh_token);
