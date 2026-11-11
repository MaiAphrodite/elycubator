package main

import (
    "time"

    sqlc "elycubator/db/sqlc"
)

type profile struct {
    targetTemp float64
    kp, ki, kd float64
}

func liveDayCount(s sqlc.Setting) int64 {
    if s.DayCount <= 0 || !s.StartedAt.Valid {
        return 0
    }
    t, err := time.Parse(time.RFC3339, s.StartedAt.String)
    if err != nil {
        return 0
    }
    elapsed := time.Since(t).Seconds()
    return 1 + int64(elapsed/86400)
}

func activeProfile(s sqlc.Setting, day int64) profile {
    if day >= 19 {
        return profile{s.TargetTempHatch, s.HatchKp, s.HatchKi, s.HatchKd}
    }
    if day > 0 {
        return profile{s.TargetTempSet, s.SetKp, s.SetKi, s.SetKd}
    }
    return profile{s.TargetTemp, s.TempKp, s.TempKi, s.TempKd}
}

func fanState(humidity, temperature, targetTemp float64, prevKipas int64) int64 {
    if humidity > 60.0 || temperature > targetTemp+0.2 {
        return 1
    }
    if humidity <= 58.0 && temperature <= targetTemp {
        return 0
    }
    return prevKipas
}

type incubationPayload struct {
    Suhu           interface{} `json:"suhu"`
    TargetSuhu     float64     `json:"target_suhu"`
    ModeAuto       int64       `json:"mode_auto"`
    HariKe         int64       `json:"hari_ke"`
    TurnerTest     int64       `json:"turner_test"`
    TargetSuhuSet  float64     `json:"target_suhu_set"`
    TargetSuhuHatch float64    `json:"target_suhu_hatch"`
    KpSet          float64     `json:"kp_set"`
    KiSet          float64     `json:"ki_set"`
    KdSet          float64     `json:"kd_set"`
    KpHatch        float64     `json:"kp_hatch"`
    KiHatch        float64     `json:"ki_hatch"`
    KdHatch        float64     `json:"kd_hatch"`
    Kp             float64     `json:"kp"`
    Ki             float64     `json:"ki"`
    Kd             float64     `json:"kd"`
    WaktuMulai     int64       `json:"waktu_mulai"`
}

func incubationView(s sqlc.Setting) incubationPayload {
    day := liveDayCount(s)
    p := activeProfile(s, day)
    var started int64
    if s.StartedAt.Valid {
        if t, err := time.Parse(time.RFC3339, s.StartedAt.String); err == nil {
            started = t.Unix()
        }
    }
    return incubationPayload{
        TargetSuhu: p.targetTemp, ModeAuto: s.ModeAuto, HariKe: day, TurnerTest: s.TurnerTest,
        TargetSuhuSet: s.TargetTempSet, TargetSuhuHatch: s.TargetTempHatch,
        KpSet: s.SetKp, KiSet: s.SetKi, KdSet: s.SetKd,
        KpHatch: s.HatchKp, KiHatch: s.HatchKi, KdHatch: s.HatchKd,
        Kp: p.kp, Ki: p.ki, Kd: p.kd, WaktuMulai: started,
    }
}
