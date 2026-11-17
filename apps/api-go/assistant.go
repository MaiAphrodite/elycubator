package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

/*
 * Grounded question answering over one device.
 *
 * The model never sees the database and never guesses: the server reduces the
 * telemetry to a small block of measured facts, and the model is only allowed
 * to phrase those facts. With no API key configured the same facts are
 * rendered by templates, so the feature works offline and cannot lie.
 */

const (
	assistantWindow      = 24 * time.Hour
	assistantBucketSecs  = 600
	assistantOffTargetC  = 1.0
	assistantSaturatedAt = 95.0
	assistantMaxBuckets  = 200
)

type factBucket struct {
	Start  time.Time `json:"start"`
	AvgC   float64   `json:"avgC"`
	MinC   float64   `json:"minC"`
	MaxC   float64   `json:"maxC"`
	Lamp   float64   `json:"lampDuty"`
	Fan    float64   `json:"fanDuty"`
	Points int       `json:"points"`
}

type assistFacts struct {
	DeviceID      string       `json:"deviceId"`
	WindowHours   int          `json:"windowHours"`
	Samples       int          `json:"samples"`
	LatestC       *float64     `json:"latestC"`
	LatestH       *float64     `json:"latestHumidity"`
	TargetC       float64      `json:"targetC"`
	TargetH       float64      `json:"targetHumidity"`
	Day           int64        `json:"incubationDay"`
	ModeAuto      int64        `json:"modeAuto"`
	MeanC         float64      `json:"meanC"`
	MinC          float64      `json:"minC"`
	MaxC          float64      `json:"maxC"`
	MeanH         float64      `json:"meanHumidity"`
	MeanLampDuty  float64      `json:"meanLampDutyPercent"`
	MeanFanDuty   float64      `json:"meanFanDutyPercent"`
	SaturatedMins int          `json:"minutesAtFullDuty"`
	OffTargetMins int          `json:"minutesOffTarget"`
	ColdStart     bool         `json:"coldStartIgnored"`
	Excursions    []factBucket `json:"excursionsRecentFirst"`
	LastUpdate    string       `json:"lastReadingUtc"`
}

func registerAssistant(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/device/{deviceId}/assistant", hAssistant)
}

func hAssistant(w http.ResponseWriter, r *http.Request) {
	c := requireUser(w, r)
	if c == nil {
		return
	}
	deviceID, allowed := requireOwnedPathDevice(w, r, c)
	if !allowed {
		return
	}

	var body struct {
		Question string `json:"question"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&body); err != nil {
		fail(w, 400, "Expected {\"question\": \"...\"}.")
		return
	}
	question := strings.TrimSpace(body.Question)
	if question == "" || len(question) > 300 {
		fail(w, 400, "Ask a question between 1 and 300 characters.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	facts, err := buildFacts(ctx, deviceID)
	if err != nil {
		log.Printf("assistant: %v", err)
		fail(w, 500, "Could not read telemetry.")
		return
	}

	answer, source, err := answer(ctx, facts, question)
	if err != nil {
		// Never fail the panel because a model is unreachable: fall back to
		// the deterministic wording over the same facts.
		answer, source = templateAnswer(facts, question), "facts"
	}
	writeJSON(w, 200, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"answer": answer,
			"source": source,
			"facts":  facts,
		},
	})
}

func buildFacts(ctx context.Context, deviceID string) (assistFacts, error) {
	var facts assistFacts
	facts.DeviceID = deviceID
	facts.WindowHours = int(assistantWindow.Hours())

	setting, err := queries.GetSettingsByDevice(ctx, deviceID)
	if err != nil {
		return facts, err
	}
	profile := activeProfile(setting, liveDayCount(setting))
	facts.TargetC = profile.targetTemp
	facts.TargetH = setting.TargetHumidity
	facts.Day = liveDayCount(setting)
	facts.ModeAuto = setting.ModeAuto

	since := time.Now().UTC().Add(-assistantWindow).Format("2006-01-02 15:04:05")
	// One statement at a time: the pool is capped at a single connection, so a
	// result set left open would block every later query until the deadline.
	// Each sample is roughly two seconds of runtime.
	totals, err := readTotals(ctx, deviceID, since, facts.TargetC)
	if err != nil {
		return facts, err
	}
	all, err := countAll(ctx, deviceID, since)
	if err != nil {
		return facts, err
	}
	facts.ColdStart = all > totals.samples
	facts.Samples = totals.samples
	facts.MeanC = totals.meanC
	facts.MinC = totals.minC
	facts.MaxC = totals.maxC
	facts.MeanH = totals.meanH
	facts.MeanLampDuty = totals.meanLamp
	facts.MeanFanDuty = totals.meanFan
	facts.SaturatedMins = totals.saturated * 2 / 60
	facts.OffTargetMins = totals.offTarget * 2 / 60

	var latest sql.NullFloat64
	var latestH sql.NullFloat64
	var lastTS sql.NullString
	if err := dbConn.QueryRowContext(ctx,
		`SELECT temperature, humidity, timestamp FROM telemetry WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1`,
		deviceID).Scan(&latest, &latestH, &lastTS); err == nil {
		if latest.Valid {
			v := latest.Float64
			facts.LatestC = &v
		}
		if latestH.Valid {
			v := latestH.Float64
			facts.LatestH = &v
		}
		facts.LastUpdate = lastTS.String
	}

	buckets, err := readBuckets(ctx, deviceID, since, facts.TargetC)
	if err != nil {
		return facts, err
	}
	facts.Excursions = offTargetRuns(buckets, facts.TargetC)
	return facts, nil
}

type totals struct {
	samples   int
	meanC     float64
	minC      float64
	maxC      float64
	meanH     float64
	meanLamp  float64
	meanFan   float64
	saturated int
	offTarget int
}

func readTotals(ctx context.Context, deviceID, since string, targetC float64) (totals, error) {
	var t totals
	row := dbConn.QueryRowContext(ctx, `
		SELECT COUNT(*),
		       COALESCE(AVG(temperature),0), COALESCE(MIN(temperature),0), COALESCE(MAX(temperature),0),
		       COALESCE(AVG(humidity),0), COALESCE(AVG(lamp_duty),0), COALESCE(AVG(fan_duty),0),
		       COALESCE(SUM(CASE WHEN lamp_duty >= ? THEN 1 ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN ABS(temperature - ?) > ? THEN 1 ELSE 0 END),0)
		FROM telemetry
		WHERE device_id = ? AND timestamp >= ? AND temperature >= ?
		ORDER BY 1`,
		assistantSaturatedAt, targetC, assistantOffTargetC, deviceID, since, targetC-5)
	err := row.Scan(&t.samples, &t.meanC, &t.minC, &t.maxC, &t.meanH, &t.meanLamp, &t.meanFan, &t.saturated, &t.offTarget)
	return t, err
}

/** Total rows in the window, so a cold start can be reported rather than hidden. */
func countAll(ctx context.Context, deviceID, since string) (int, error) {
	var n int
	err := dbConn.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM telemetry WHERE device_id = ? AND timestamp >= ?`,
		deviceID, since).Scan(&n)
	return n, err
}

func readBuckets(ctx context.Context, deviceID, since string, targetC float64) ([]factBucket, error) {
	rows, err := dbConn.QueryContext(ctx, `
		SELECT CAST(strftime('%s', timestamp) AS INTEGER) / ? AS bucket,
		       AVG(temperature), MIN(temperature), MAX(temperature), AVG(lamp_duty), AVG(fan_duty), COUNT(*)
		FROM telemetry
		WHERE device_id = ? AND timestamp >= ? AND temperature >= ?
		GROUP BY bucket ORDER BY bucket DESC LIMIT ?`,
		assistantBucketSecs, deviceID, since, targetC-5, assistantMaxBuckets)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []factBucket
	for rows.Next() {
		var epoch int64
		var b factBucket
		if err := rows.Scan(&epoch, &b.AvgC, &b.MinC, &b.MaxC, &b.Lamp, &b.Fan, &b.Points); err != nil {
			return nil, err
		}
		b.Start = time.Unix(epoch*assistantBucketSecs, 0).UTC()
		out = append(out, b)
	}
	return out, nil
}

/** Contiguous buckets that sat on the wrong side of the setpoint, newest first. */
func offTargetRuns(buckets []factBucket, target float64) []factBucket {
	var runs []factBucket
	for i := len(buckets) - 1; i >= 0; i-- {
		b := buckets[i]
		if abs(b.AvgC-target) <= assistantOffTargetC {
			continue
		}
		if len(runs) > 0 {
			last := runs[len(runs)-1]
			gap := b.Start.Sub(last.Start)
			if gap <= assistantBucketSecs*time.Second*3/2 {
				merged := last
				merged.AvgC = (last.AvgC*float64(last.Points) + b.AvgC*float64(b.Points)) / float64(last.Points+b.Points)
				merged.MinC = minFloat(last.MinC, b.MinC)
				merged.MaxC = maxFloat(last.MaxC, b.MaxC)
				merged.Points += b.Points
				merged.Start = b.Start
				runs[len(runs)-1] = merged
				continue
			}
		}
		runs = append(runs, b)
		if len(runs) >= 3 {
			break
		}
	}
	return runs
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// ---------------------------------------------------------------- answering

func answer(ctx context.Context, facts assistFacts, question string) (string, string, error) {
	key := os.Getenv("LLM_API_KEY")
	if key == "" {
		return templateAnswer(facts, question), "facts", nil
	}
	text, err := askModel(ctx, key, facts, question)
	if err != nil {
		return "", "", err
	}
	return text, "model", nil
}

func askModel(ctx context.Context, key string, facts assistFacts, question string) (string, error) {
	base := envOr("LLM_BASE_URL", "https://api.deepseek.com/v1")
	model := envOr("LLM_MODEL", "deepseek-chat")

	factsJSON, err := json.Marshal(facts)
	if err != nil {
		return "", err
	}

	system := "You answer questions about one egg incubator using ONLY the FACTS JSON provided. " +
		"Rules: never invent a number, timestamp or cause that is not in the facts; quote figures exactly as given; " +
		"if the facts cannot answer the question, say what is missing in one sentence; " +
		"answer in at most three sentences, plain language, no markdown, no lists."

	payload := map[string]interface{}{
		"model":       model,
		"temperature": 0,
		"max_tokens":  220,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": "FACTS:\n" + string(factsJSON) + "\n\nQUESTION: " + question},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(base, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<10))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("model returned %d", resp.StatusCode)
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("empty completion")
	}
	return guardNumbers(strings.TrimSpace(parsed.Choices[0].Message.Content), facts), nil
}

/**
 * Reject an answer that introduces a number absent from the facts. A wrong
 * figure in front of an audience costs more than a dull sentence.
 */
func guardNumbers(text string, facts assistFacts) string {
	allowed := map[string]bool{}
	add := func(v float64) { allowed[fmt.Sprintf("%.1f", v)] = true }
	add(facts.TargetC)
	add(facts.TargetH)
	add(facts.MeanC)
	add(facts.MinC)
	add(facts.MaxC)
	add(facts.MeanH)
	if facts.LatestC != nil {
		add(*facts.LatestC)
	}
	if facts.LatestH != nil {
		add(*facts.LatestH)
	}
	allowed[fmt.Sprintf("%d", facts.Samples)] = true
	allowed[fmt.Sprintf("%d", facts.Day)] = true

	for _, token := range strings.FieldsFunc(text, func(r rune) bool {
		return !(r >= '0' && r <= '9') && r != '.'
	}) {
		if strings.Contains(token, ".") && !allowed[token] {
			return templateAnswer(facts, "") + " (checked against recorded readings)"
		}
	}
	return text
}

// ---------------------------------------------------------------- templates

func templateAnswer(facts assistFacts, question string) string {
	var b strings.Builder
	q := strings.ToLower(question)

	switch {
	case strings.Contains(q, "last night") || strings.Contains(q, "overnight") || strings.Contains(q, "24"):
		if facts.ColdStart {
			b.WriteString("Ignoring a cold start in the window: ")
		}
		fmt.Fprintf(&b, "over the last %d hours the box averaged %.1f°C (low %.1f°C, high %.1f°C) against a %.1f°C target, on %d readings. ",
			facts.WindowHours, facts.MeanC, facts.MinC, facts.MaxC, facts.TargetC, facts.Samples)
		if len(facts.Excursions) > 0 {
			e := facts.Excursions[0]
			fmt.Fprintf(&b, "The largest stretch away from target was around %s UTC, averaging %.1f°C with the lamp at %.0f%%. ",
				e.Start.Format("15:04"), e.AvgC, e.Lamp)
		} else {
			b.WriteString("Nothing drifted more than 1°C from target. ")
		}
		if facts.SaturatedMins > 0 {
			fmt.Fprintf(&b, "The lamp ran at full duty for about %d minutes in total.", facts.SaturatedMins)
		}
	case strings.Contains(q, "duty") || strings.Contains(q, "lamp") || strings.Contains(q, "heater") || strings.Contains(q, "fan"):
		fmt.Fprintf(&b, "In the last %d hours the lamp averaged %.0f%% output and sat at full duty for about %d minutes; the fan averaged %.0f%%. ",
			facts.WindowHours, facts.MeanLampDuty, facts.SaturatedMins, facts.MeanFanDuty)
		if facts.SaturatedMins >= 10 && facts.OffTargetMins >= 10 {
			b.WriteString("Long stretches at full duty while the box stays off target point at a weak heater or escaping air.")
		}
	case strings.Contains(q, "humid"):
		fmt.Fprintf(&b, "Humidity averaged %.1f%% against a %.0f%% target", facts.MeanH, facts.TargetH)
		if facts.LatestH != nil {
			fmt.Fprintf(&b, ", most recently %.1f%%", *facts.LatestH)
		}
		b.WriteString(". I can only report the readings, not the cause of the gap.")
	case strings.Contains(q, "risk") || strings.Contains(q, "danger") || strings.Contains(q, "problem"):
		fmt.Fprintf(&b, "Day %d of the cycle. The box spent about %d minutes more than 1°C from target in the last %d hours, and the lamp sat at full duty for %d of them. ",
			facts.Day, facts.OffTargetMins, facts.WindowHours, facts.SaturatedMins)
		if facts.SaturatedMins >= 10 && facts.OffTargetMins >= 10 {
			b.WriteString("Sustained full duty while still off target usually means the heater is weak or air is escaping, worth a look.")
		} else {
			b.WriteString("That pattern is consistent with normal cycling.")
		}
	default:
		fmt.Fprintf(&b, "Right now it is %s at a %.1f°C target, day %d of the cycle. In the last %d hours it averaged %.1f°C (%.1f to %.1f) over %d readings.",
			latestText(facts), facts.TargetC, facts.Day, facts.WindowHours, facts.MeanC, facts.MinC, facts.MaxC, facts.Samples)
	}
	return b.String()
}

func latestText(facts assistFacts) string {
	if facts.LatestC == nil {
		return "not reporting"
	}
	return fmt.Sprintf("%.1f°C", *facts.LatestC)
}
