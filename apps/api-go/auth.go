package main

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "strings"

    sqlc "elycubator/db/sqlc"
)

func registerAuth(mux *http.ServeMux) {
    mux.HandleFunc("POST /api/auth/register", hRegister)
    mux.HandleFunc("POST /api/auth/login", hLogin)
    mux.HandleFunc("POST /api/auth/refresh", hRefresh)
    mux.HandleFunc("POST /api/auth/logout", hLogout)
    mux.HandleFunc("GET /api/auth/me", hMe)
}

func normalizeEmail(email string) string {
    return strings.ToLower(strings.TrimSpace(email))
}

func hRegister(w http.ResponseWriter, r *http.Request) {
    if !registrationEnabled {
        fail(w, http.StatusForbidden, "Registration is disabled.")
        return
    }
    var body struct {
        Email    string `json:"email"`
        Password string `json:"password"`
        Name     string `json:"name"`
    }
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        fail(w, 400, "Invalid request body.")
        return
    }
    body.Email = normalizeEmail(body.Email)
    if body.Email == "" || !strings.Contains(body.Email, "@") || len(body.Email) > 254 || len(body.Password) < 8 || len(body.Password) > 200 {
        fail(w, 400, "email and password (8 to 200 chars) are required.")
        return
    }
    if _, err := queries.GetUserByEmail(r.Context(), body.Email); err == nil {
        fail(w, 409, "Email is already registered.")
        return
    } else if err != sql.ErrNoRows {
        fail(w, 500, "db error")
        return
    }
    hash, err := hashPassword(body.Password)
    if err != nil {
        fail(w, 500, "hash error")
        return
    }
    user, err := queries.CreateUser(r.Context(), sqlc.CreateUserParams{
        ID: newID(), Email: body.Email, Name: sql.NullString{String: strings.TrimSpace(body.Name), Valid: strings.TrimSpace(body.Name) != ""},
        PasswordHash: hash,
    })
    if err != nil {
        fail(w, 500, "create user failed")
        return
    }
    ok(w, map[string]interface{}{"id": user.ID, "email": user.Email, "name": nameStr(user.Name)})
}

func nameStr(ns sql.NullString) string {
    if ns.Valid {
        return ns.String
    }
    return ""
}

const REFRESH_COOKIE = "refresh_token"

func hLogin(w http.ResponseWriter, r *http.Request) {
    var body struct {
        Email    string `json:"email"`
        Password string `json:"password"`
    }
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        fail(w, 400, "email and password required.")
        return
    }
    body.Email = normalizeEmail(body.Email)
    user, err := queries.GetUserByEmail(r.Context(), body.Email)
    if err != nil || !verifyPassword(user.PasswordHash, body.Password) {
        fail(w, 401, "Invalid credentials.")
        return
    }

    access, err := signToken(user.ID, "user", user.Email, "", accessTokenTTL)
    if err != nil {
        fail(w, 500, "token error")
        return
    }
    rawRefresh := newToken(32)
    if err := queries.UpdateUserRefreshToken(r.Context(), sqlc.UpdateUserRefreshTokenParams{
        RefreshToken: sql.NullString{String: sha256Hex(rawRefresh), Valid: true},
        ID:           user.ID,
    }); err != nil {
        fail(w, 500, "session error")
        return
    }
    setRefreshCookie(w, r, rawRefresh, int(refreshTokenTTL.Seconds()))
    ok(w, map[string]interface{}{
        "accessToken": access,
        "user":        map[string]interface{}{"id": user.ID, "email": user.Email, "name": nameStr(user.Name)},
    })
}

func hRefresh(w http.ResponseWriter, r *http.Request) {
    c, err := r.Cookie(REFRESH_COOKIE)
    if err != nil || c.Value == "" {
        fail(w, 401, "Missing refresh token.")
        return
    }
    var userID, email string
    err = dbConn.QueryRowContext(r.Context(),
        "SELECT id, email FROM users WHERE refresh_token = ?", sha256Hex(c.Value)).Scan(&userID, &email)
    if err != nil {
        setRefreshCookie(w, r, "", -1)
        fail(w, 401, "Invalid refresh token.")
        return
    }

    rawRefresh := newToken(32)
    if err := queries.UpdateUserRefreshToken(r.Context(), sqlc.UpdateUserRefreshTokenParams{
        RefreshToken: sql.NullString{String: sha256Hex(rawRefresh), Valid: true},
        ID:           userID,
    }); err != nil {
        fail(w, 500, "session error")
        return
    }
    access, err := signToken(userID, "user", email, "", accessTokenTTL)
    if err != nil {
        fail(w, 500, "token error")
        return
    }
    setRefreshCookie(w, r, rawRefresh, int(refreshTokenTTL.Seconds()))
    ok(w, map[string]interface{}{"accessToken": access})
}

func hLogout(w http.ResponseWriter, r *http.Request) {
    if claims, err := parseToken(bearer(r)); err == nil && claims.Type == "user" {
        queries.UpdateUserRefreshToken(r.Context(), sqlc.UpdateUserRefreshTokenParams{RefreshToken: sql.NullString{}, ID: claims.Sub})
    }
    setRefreshCookie(w, r, "", -1)
    okMsg(w, "Logged out.")
}

func hMe(w http.ResponseWriter, r *http.Request) {
    c := requireUser(w, r)
    if c == nil {
        return
    }
    user, err := queries.GetUserByID(r.Context(), c.Sub)
    if err != nil {
        fail(w, 404, "User not found.")
        return
    }
    ok(w, map[string]interface{}{"id": user.ID, "email": user.Email, "name": nameStr(user.Name)})
}
