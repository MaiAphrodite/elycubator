package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt"
	_ "modernc.org/sqlite"
)

const (
	defaultJWTSentinel    = "dev-secret-change-me"
	defaultDeviceSentinel = "dev-device-secret"
)

var (
	jwtSecret           = envOr("JWT_SECRET", defaultJWTSentinel)
	deviceSecret        = envOr("DEVICE_SECRET", defaultDeviceSentinel)
	port                = envOr("PORT", "3000")
	dbPath              = envOr("DB_PATH", "elycubator.db")
	webDist             = envOr("WEB_DIST", "../web/dist")
	appEnv              = envOr("APP_ENV", "development")
	registrationEnabled = envOr("REGISTRATION_ENABLED", "true") == "true"
	corsOrigins         = envOr("CORS_ORIGINS", "")
	accessTokenTTL      = parseDur(envOr("JWT_EXPIRES_IN", "15m"), 15*time.Minute)
	refreshTokenTTL     = parseDur(envOr("REFRESH_TOKEN_EXPIRES_IN", "168h"), 7*24*time.Hour)
	deviceTokenTTL      = parseDur(envOr("DEVICE_TOKEN_EXPIRES_IN", "720h"), 30*24*time.Hour)
	telemetryRetention  = envOr("TELEMETRY_RETENTION_DAYS", "30")
	legacyAPIToken      = envOr("LEGACY_API_TOKEN", "")
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func validateConfig() error {
	if appEnv != "production" {
		return nil
	}
	if jwtSecret == defaultJWTSentinel || len(jwtSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be a random value of at least 32 characters in production")
	}
	if deviceSecret == defaultDeviceSentinel || len(deviceSecret) < 16 {
		return fmt.Errorf("DEVICE_SECRET must be a random value of at least 16 characters in production")
	}
	return nil
}

func newID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func newToken(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type Claims struct {
	Sub     string `json:"sub"`
	Email   string `json:"email,omitempty"`
	MacAddr string `json:"macAddress,omitempty"`
	Type    string `json:"type"`
	jwt.StandardClaims
}

func signToken(sub, typ, email, mac string, ttl time.Duration) (string, error) {
	c := Claims{Sub: sub, Email: email, MacAddr: mac, Type: typ,
		StandardClaims: jwt.StandardClaims{ExpiresAt: time.Now().Add(ttl).Unix(), IssuedAt: time.Now().Unix()}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(jwtSecret))
}

func parseToken(tok string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tok, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims.Sub == "" {
		return nil, jwt.ErrSignatureInvalid
	}
	return claims, nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func ok(w http.ResponseWriter, data interface{}) {
	writeJSON(w, 200, map[string]interface{}{"success": true, "data": data})
}
func okMsg(w http.ResponseWriter, msg string) {
	writeJSON(w, 200, map[string]interface{}{"success": true, "message": msg})
}
func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]interface{}{"success": false, "error": msg})
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return h[7:]
	}
	return ""
}

func requireUser(w http.ResponseWriter, r *http.Request) *Claims {
	tok := bearer(r)
	if tok == "" {
		fail(w, 401, "Missing authorization token.")
		return nil
	}
	c, err := parseToken(tok)
	if err != nil || c.Type != "user" {
		fail(w, 401, "Invalid or expired user token.")
		return nil
	}
	return c
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if candidate := strings.TrimSpace(parts[len(parts)-1]); candidate != "" {
			return candidate
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func originInList(origin string) bool {
	for _, o := range strings.Split(corsOrigins, ",") {
		if strings.TrimSpace(o) == origin {
			return true
		}
	}
	return false
}

func originAllowed(origin string, r *http.Request) bool {
	if origin == "" {
		return true
	}
	if originInList(origin) {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

func corsWrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Add("Vary", "Origin")
			if originInList(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			if origin == "" || !originInList(origin) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

const maxBodyBytes = 128 << 10

func limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func setRefreshCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     REFRESH_COOKIE,
		Value:    value,
		Path:     "/api/auth",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   requestIsHTTPS(r),
	})
}

func parseDur(s string, fallback time.Duration) time.Duration {
	if d, err := time.ParseDuration(s); err == nil {
		return d
	}
	return fallback
}

func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

func sqlBool(i int64) bool { return i != 0 }

func nullStr(s sql.NullString) interface{} {
	if s.Valid {
		return s.String
	}
	return nil
}

func nowRFC() string { return time.Now().UTC().Format(time.RFC3339) }
