package main

import (
    "net/http"
    "strings"
    "sync"
    "time"
)

type rateRule struct {
    prefix string
    perSec float64
    burst  float64
}

type tokenBucket struct {
    tokens float64
    last   time.Time
}

var rateRules = []rateRule{
    {prefix: "/api/auth/register", perSec: 5.0 / 60, burst: 5},
    {prefix: "/api/auth/login", perSec: 10.0 / 60, burst: 10},
    {prefix: "/api/auth/refresh", perSec: 30.0 / 60, burst: 30},
    {prefix: "/api/device/claim", perSec: 10.0 / 60, burst: 10},
    {prefix: "/api/device/init", perSec: 30.0 / 60, burst: 30},
    {prefix: "/api/device/live", perSec: 30.0 / 60, burst: 30},
    {prefix: "/api/device/stream", perSec: 30.0 / 60, burst: 30},
    {prefix: "/api/", perSec: 600.0 / 60, burst: 120},
}

var (
    rateMu    sync.Mutex
    buckets   = map[string]*tokenBucket{}
    lastSweep = time.Now()
)

func ruleFor(path string) (rateRule, bool) {
    for _, rule := range rateRules {
        if strings.HasPrefix(path, rule.prefix) {
            return rule, true
        }
    }
    return rateRule{}, false
}

func allowRequest(key string, rule rateRule, now time.Time) bool {
    rateMu.Lock()
    defer rateMu.Unlock()

    if now.Sub(lastSweep) > 10*time.Minute {
        for k, b := range buckets {
            if now.Sub(b.last) > 15*time.Minute {
                delete(buckets, k)
            }
        }
        lastSweep = now
    }

    b, found := buckets[key]
    if !found {
        b = &tokenBucket{tokens: rule.burst, last: now}
        buckets[key] = b
    } else {
        b.tokens += now.Sub(b.last).Seconds() * rule.perSec
        if b.tokens > rule.burst {
            b.tokens = rule.burst
        }
        b.last = now
    }

    if b.tokens < 1 {
        return false
    }
    b.tokens -= 1
    return true
}

func rateLimitWrap(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/api/health" {
            next.ServeHTTP(w, r)
            return
        }
        rule, limited := ruleFor(r.URL.Path)
        if limited && !allowRequest(clientIP(r)+"|"+rule.prefix, rule, time.Now()) {
            w.Header().Set("Retry-After", "10")
            fail(w, http.StatusTooManyRequests, "Too many requests. Slow down and retry shortly.")
            return
        }
        next.ServeHTTP(w, r)
    })
}

func resetRateLimits() {
    rateMu.Lock()
    defer rateMu.Unlock()
    buckets = map[string]*tokenBucket{}
}
