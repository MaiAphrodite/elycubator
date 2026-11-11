package main

import (
    "crypto/hmac"
    "crypto/rand"
    "crypto/sha256"
    "crypto/subtle"
    "encoding/hex"
    "strings"

    "golang.org/x/crypto/argon2"
)

var passwordWorkers = make(chan struct{}, 2)

func argon2IDKey(pw string, salt []byte) []byte {
    passwordWorkers <- struct{}{}
    defer func() { <-passwordWorkers }()
    return argon2.IDKey([]byte(pw), salt, 1, 64*1024, 4, 32)
}

func hashPassword(pw string) (string, error) {
    salt := make([]byte, 16)
    rand.Read(salt)
    key := argon2IDKey(pw, salt)
    return "argon2id$" + hex.EncodeToString(salt) + "$" + hex.EncodeToString(key), nil
}

func verifyPassword(hash, pw string) bool {
    parts := strings.Split(hash, "$")
    if len(parts) != 3 || parts[0] != "argon2id" {
        return false
    }
    salt, err1 := hex.DecodeString(parts[1])
    want, err2 := hex.DecodeString(parts[2])
    if err1 != nil || err2 != nil {
        return false
    }
    got := argon2IDKey(pw, salt)
    return subtle.ConstantTimeCompare(got, want) == 1
}

func sha256Hex(value string) string {
    sum := sha256.Sum256([]byte(value))
    return hex.EncodeToString(sum[:])
}

func computeHmac(data, secret string) string {
    m := hmac.New(sha256.New, []byte(secret))
    m.Write([]byte(data))
    return hex.EncodeToString(m.Sum(nil))
}

func verifyHmac(data, secret, received string) bool {
    expected := computeHmac(data, secret)
    return subtle.ConstantTimeCompare([]byte(expected), []byte(received)) == 1
}
