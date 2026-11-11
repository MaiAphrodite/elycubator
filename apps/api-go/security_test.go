package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "path/filepath"
    "testing"

    sqlc "elycubator/db/sqlc"
)

func TestMain(m *testing.M) {
    dir, err := os.MkdirTemp("", "elycubator-test-*")
    if err != nil {
        panic(err)
    }

    jwtSecret = "test-secret-0123456789abcdef0123456789abcdef"
    deviceSecret = "test-device-secret-value"
    webDist = dir

    dbConn, err = openDB(filepath.Join(dir, "test.db"))
    if err != nil {
        panic(err)
    }
    if err := applySchema(dbConn); err != nil {
        panic(err)
    }
    queries = sqlc.New(dbConn)

    code := m.Run()
    dbConn.Close()
    os.RemoveAll(dir)
    os.Exit(code)
}

type jsonEnvelope struct {
    Success bool            `json:"success"`
    Data    json.RawMessage `json:"data"`
    Error   string          `json:"error"`
}

func request(t *testing.T, method, path, token string, body interface{}) *httptest.ResponseRecorder {
    t.Helper()
    var buf bytes.Buffer
    if body != nil {
        if err := json.NewEncoder(&buf).Encode(body); err != nil {
            t.Fatalf("encode body: %v", err)
        }
    }
    req := httptest.NewRequest(method, path, &buf)
    if body != nil {
        req.Header.Set("Content-Type", "application/json")
    }
    if token != "" {
        req.Header.Set("Authorization", "Bearer "+token)
    }
    rec := httptest.NewRecorder()
    newRouter().ServeHTTP(rec, req)
    return rec
}

func envelope(t *testing.T, rec *httptest.ResponseRecorder) jsonEnvelope {
    t.Helper()
    var env jsonEnvelope
    if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
        t.Fatalf("decode envelope %q: %v", rec.Body.String(), err)
    }
    return env
}

func registerAndLogin(t *testing.T, email string) (token, userID string) {
    t.Helper()
    rec := request(t, http.MethodPost, "/api/auth/register", "", map[string]string{
        "email": email, "password": "password123", "name": "Test",
    })
    if rec.Code != http.StatusOK {
        t.Fatalf("register %s: %d %s", email, rec.Code, rec.Body.String())
    }
    rec = request(t, http.MethodPost, "/api/auth/login", "", map[string]string{
        "email": email, "password": "password123",
    })
    if rec.Code != http.StatusOK {
        t.Fatalf("login %s: %d %s", email, rec.Code, rec.Body.String())
    }
    var data struct {
        AccessToken string `json:"accessToken"`
        User        struct {
            ID string `json:"id"`
        } `json:"user"`
    }
    env := envelope(t, rec)
    if err := json.Unmarshal(env.Data, &data); err != nil {
        t.Fatalf("decode login: %v", err)
    }
    if data.AccessToken == "" || data.User.ID == "" {
        t.Fatalf("login response incomplete: %s", rec.Body.String())
    }
    return data.AccessToken, data.User.ID
}

func initDevice(t *testing.T, mac, pin string) (deviceID, deviceToken string) {
    t.Helper()
    rec := request(t, http.MethodPost, "/api/device/init", "", map[string]string{
        "macAddress":    mac,
        "pairingPin":    pin,
        "hmacSignature": computeHmac(mac+":"+pin, deviceSecret),
    })
    if rec.Code != http.StatusOK {
        t.Fatalf("init %s: %d %s", mac, rec.Code, rec.Body.String())
    }
    var data struct {
        DeviceID    string `json:"deviceId"`
        DeviceToken string `json:"deviceToken"`
    }
    if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
        t.Fatalf("decode init: %v", err)
    }
    if data.DeviceID == "" || data.DeviceToken == "" {
        t.Fatalf("init response incomplete: %s", rec.Body.String())
    }
    return data.DeviceID, data.DeviceToken
}

func TestDeviceOwnershipIsolation(t *testing.T) {
    resetRateLimits()
    aliceToken, _ := registerAndLogin(t, "alice@example.com")
    bobToken, _ := registerAndLogin(t, "bob@example.com")

    deviceID, _ := initDevice(t, "AA:BB:CC:00:00:01", "111111")

    rec := request(t, http.MethodPost, "/api/device/claim", aliceToken, map[string]string{
        "pairingPin": "111111", "nickname": "Alice Incubator",
    })
    if rec.Code != http.StatusOK {
        t.Fatalf("claim: %d %s", rec.Code, rec.Body.String())
    }

    owned := []struct {
        method string
        path   string
        body   interface{}
    }{
        {http.MethodGet, "/api/device/" + deviceID + "/settings", nil},
        {http.MethodPut, "/api/device/" + deviceID + "/settings", map[string]interface{}{"targetTemp": 37.5}},
        {http.MethodGet, "/api/device/" + deviceID + "/incubation", nil},
        {http.MethodPost, "/api/device/" + deviceID + "/incubation/start", nil},
        {http.MethodPost, "/api/device/" + deviceID + "/incubation/stop", nil},
        {http.MethodPost, "/api/device/" + deviceID + "/incubation/mode", map[string]bool{"val": false}},
        {http.MethodPost, "/api/device/" + deviceID + "/incubation/test-turner", nil},
        {http.MethodPut, "/api/device/" + deviceID + "/incubation/profiles", map[string]float64{"tss": 40}},
        {http.MethodPost, "/api/device/" + deviceID + "/servo/trigger", nil},
        {http.MethodGet, "/api/telemetry/history/" + deviceID + "?limit=10", nil},
    }

    for _, tc := range owned {
        if rec := request(t, tc.method, tc.path, aliceToken, tc.body); rec.Code != http.StatusOK {
            t.Errorf("owner %s %s: got %d %s", tc.method, tc.path, rec.Code, rec.Body.String())
        }
        if rec := request(t, tc.method, tc.path, bobToken, tc.body); rec.Code != http.StatusNotFound {
            t.Errorf("stranger %s %s: got %d, want 404 (%s)", tc.method, tc.path, rec.Code, rec.Body.String())
        }
    }

    if rec := request(t, http.MethodGet, "/api/device/live?deviceId="+deviceID+"&token="+bobToken, "", nil); rec.Code != http.StatusNotFound {
        t.Errorf("stranger live subscribe: got %d, want 404 (%s)", rec.Code, rec.Body.String())
    }
    if rec := request(t, http.MethodGet, "/api/device/live?deviceId="+deviceID+"&token="+aliceToken, "", nil); rec.Code == http.StatusNotFound || rec.Code == http.StatusUnauthorized {
        t.Errorf("owner live subscribe was rejected: %d %s", rec.Code, rec.Body.String())
    }
}

func TestDeviceTokenIsStored(t *testing.T) {
    resetRateLimits()
    _, deviceToken := initDevice(t, "AA:BB:CC:00:00:02", "222222")
    rec := request(t, http.MethodGet, "/api/device/stream?token="+deviceToken, "", nil)
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("device stream auth: got %d, want 400 after auth passes (%s)", rec.Code, rec.Body.String())
    }
}

func TestRefreshRotatesAndRejectsReplay(t *testing.T) {
    resetRateLimits()
    email := "refresh@example.com"
    request(t, http.MethodPost, "/api/auth/register", "", map[string]string{
        "email": email, "password": "password123",
    })
    login := request(t, http.MethodPost, "/api/auth/login", "", map[string]string{
        "email": email, "password": "password123",
    })
    if login.Code != http.StatusOK {
        t.Fatalf("login: %d %s", login.Code, login.Body.String())
    }
    cookies := login.Result().Cookies()
    if len(cookies) == 0 {
        t.Fatal("login did not set a refresh cookie")
    }

    refreshReq := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
    refreshReq.AddCookie(cookies[0])
    refreshRec := httptest.NewRecorder()
    newRouter().ServeHTTP(refreshRec, refreshReq)
    if refreshRec.Code != http.StatusOK {
        t.Fatalf("refresh: %d %s", refreshRec.Code, refreshRec.Body.String())
    }

    replayReq := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
    replayReq.AddCookie(cookies[0])
    replayRec := httptest.NewRecorder()
    newRouter().ServeHTTP(replayRec, replayReq)
    if replayRec.Code != http.StatusUnauthorized {
        t.Fatalf("replayed refresh cookie: got %d, want 401", replayRec.Code)
    }
}

func TestLoginRateLimit(t *testing.T) {
    resetRateLimits()
    var sawLimit bool
    for i := 0; i < 15; i++ {
        rec := request(t, http.MethodPost, "/api/auth/login", "", map[string]string{
            "email": "nobody@example.com", "password": "wrong-password",
        })
        if rec.Code == http.StatusTooManyRequests {
            sawLimit = true
            break
        }
    }
    if !sawLimit {
        t.Fatal("login attempts were never rate limited")
    }
}

func TestLegacyApiPhpIsGone(t *testing.T) {
    if rec := request(t, http.MethodGet, "/api.php?action=stop", "", nil); rec.Code != http.StatusNotFound {
        t.Fatalf("/api.php: got %d, want 404", rec.Code)
    }
}

func TestHealth(t *testing.T) {
    if rec := request(t, http.MethodGet, "/api/health", "", nil); rec.Code != http.StatusOK {
        t.Fatalf("health: %d %s", rec.Code, rec.Body.String())
    }
}

func TestSchemaAppliesEveryStatement(t *testing.T) {
    var count int
    if err := dbConn.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='index' AND name='idx_users_refresh'").Scan(&count); err != nil {
        t.Fatalf("query sqlite_master: %v", err)
    }
    if count != 1 {
        t.Fatalf("idx_users_refresh missing: the schema exec skipped statements")
    }
}
