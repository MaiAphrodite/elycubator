# PinkEggs Exhibit Guide

A booth-ready explanation of the product, the engineering decisions behind it, and the story to tell in under two minutes.

## One-line pitch

**PinkEggs is an incubator that does not only control temperature. It records the whole cycle, explains its current state in plain language, and tells you when the box stops behaving normally.**

The important distinction is that the assistant does not invent the numbers. The Go API reduces real telemetry into measured facts, and the model only explains those facts.

## The 20-second version

> "This is a real incubator controller connected over WiFi. It reads temperature, humidity, lamp output, fan output and turning state every two seconds. The dashboard keeps the live state, the history and the alerts together. You can ask what happened overnight, and the answer is grounded in the readings from this specific box. If the device goes offline, the stored history and the explanation still work."

## The 90-second demo

1. Open `https://pinkegg.app` on the phone.
2. If the phone is not already installed, tap the install card or use Chrome's menu and choose **Add to Home screen**.
3. Show the standalone app icon and the live link trace in the header. Explain that the trace represents received readings, not WiFi signal strength.
4. Point at the three top cards:
   - **Suhu**: current temperature, target, difference and recent trend.
   - **Kelembapan**: current humidity, target, difference and recent trend.
   - **Inkubasi**: day, elapsed time, active phase and progress toward the hatcher phase.
5. Tap **Tanya tentang inkubator ini** and choose **Apakah batch berisiko?**.
6. Point out the label **ditulis dari data tercatat**. The answer is generated from the box's telemetry, not from a generic incubation article.
7. Show the actuator deck. Tap the lamp tile and explain:
   - `Nyala · 47%` means the output is allowed and the controller is driving it at 47%.
   - `Nyala · diam` means the output is enabled but the controller currently asks for 0%.
   - The small history band shows recent output, not a decorative animation.
8. Open **Riwayat** and show the temperature and humidity charts, then the exact readings.
9. If demonstrating failure, use a safe simulator or a disconnected low-voltage test setup. Do not unplug mains equipment in front of visitors unless the hardware is designed for that demonstration.

## What makes it different from a normal incubator dashboard

### 1. It is a record, not just a display

Most incubator demos show the current temperature. PinkEggs keeps the current state, the last readings, the actuator history and the incubation phase together.

Every two-second reading contains:

- temperature
- humidity
- lamp duty
- fan duty
- servo angle
- device id
- timestamp

The server stores those readings in SQLite with device ownership checks. The History page can export them as CSV.

### 2. It explains failure instead of hiding it

The alert system is deterministic. It does not wait for an LLM to decide whether a dangerous condition exists.

Current alert rules include:

- no new reading after 15 seconds
- temperature more than 1°C from the active target
- temperature more than 2.5°C from target, escalated as critical
- humidity more than 10 percentage points from target
- recovery when readings begin arriving again
- hatcher phase information from day 19

The model can describe an alert, but it cannot control the lamp, fan or turner.

### 3. The AI is grounded in this device

The user can ask questions such as:

- How was last night?
- Is the batch at risk?
- How is humidity?
- How long was the lamp at full duty?

The server creates a fact block from a 24-hour window. The block contains summary values and 20-minute analysis buckets. Each bucket keeps average, minimum, maximum and actuator averages, so the model gets a useful trend without receiving thousands of raw rows.

The model receives facts such as:

```json
{
  "meanTemperatureC": 37.1,
  "minTemperatureC": 32.9,
  "maxTemperatureC": 44.0,
  "meanHumidityPercent": 29.1,
  "lampMinutesAtFullDuty": 49,
  "minutesMoreThan1CFromTarget": 58,
  "targetTemperatureC": 37.8,
  "targetHumidityPercent": 55,
  "incubationDay": 1
}
```

It does not receive permission to change settings or operate the hardware.

If the model is unavailable, the same question falls back to deterministic templates. The UI says whether the answer came from the model or directly from the readings.

### 4. It remains useful when the incubator is offline

The device does not need to be online to ask about stored history. The assistant uses the owned device list and server telemetry, not only the live WebSocket.

When the device is offline:

- the dashboard can still show the last stored readings
- the assistant can still summarize the stored window
- the alert engine can show that no new readings are arriving
- the PWA shell can open from its service worker cache
- live values are not falsely presented as current

That separation between live state and stored evidence is intentional.

## Why each major component exists

### Header

**Contains**: PinkEggs mark, user identity, live link trace, install action, alert bell and logout.

**Why**:

- the brand is visible without repeating it inside every page
- the link trace shows telemetry freshness without using a generic online pill
- the install action makes the PWA discoverable during a live demo
- the alert bell keeps urgent information available on every route

### PageHeader

**Contains**: title, mono subtitle and page actions.

**Why**: Dashboard, History, Devices and Settings used to have different header spacing and different action styles. One shared component keeps the whole product visually coherent.

### Temperature and humidity cards

**Contains**: live value, target, delta, min/max and a recent trend strip.

**Why**: a number without its target has little meaning. A target delta answers the first question a visitor asks: "Is that good?" The strip is intentionally short because the live buffer is about 100 seconds. Long-term analysis belongs on History.

### Incubation card

**Contains**: day, elapsed duration, Auto or Manual state, target and progress toward the day-19 hatcher phase.

**Why**: the same temperature means something different on day 1 and day 19. The phase is the context for the reading.

### Actuator deck

**Contains**: Lamp tile, Fan tile, output history bars and Turn now control.

**Why**:

- the whole tile is a large touch target
- `Nyala` and `Mati` are ordinary operator language
- output percentage separates permission from what the controller is currently driving
- duty history shows whether the controller is working steadily or fighting a problem
- turning is a one-shot command, so it should not look like a persistent on/off switch

### PID control card

**Contains**: active Kp, Ki, Kd plus Setter and Hatcher values.

**Why**: PID values are not decorative diagnostics. Showing the active set and the stored alternatives explains why the actuator output may change at the hatcher transition.

### Device card

**Contains**: name, MAC address, last reading age, reading count and Live/Stale state.

**Why**: a physical exhibit needs a clear identity. It should be obvious which box is producing the numbers.

### History page

**Contains**: temperature chart, humidity chart and individual readings.

**Why**: the dashboard is for decisions now. History is for explaining what happened. The axes preserve seconds because the active client window is only around 100 seconds, and minute-only labels would repeat the same value.

### Alert bell

**Contains**: unread count, severity, title, detail, age, notification permission and clear action.

**Why**: an alert should remain visible after a transient condition disappears. The bell gives the visitor something to inspect and lets the presenter show recovery.

### Assistant panel

**Contains**: preset questions, free text, loading state, source label and answer.

**Why**: presets prevent demo dead air. Free text demonstrates generalization. The source label makes the trust boundary visible.

### PWA layer

**Contains**: manifest, maskable icons, service worker and install card.

**Why**: a phone home-screen app feels like a product, while a browser tab feels like a development tool. The service worker caches only the shell and static assets. API responses are never cached because stale sensor data must not pretend to be current.

## Architecture in one diagram

```text
ESP32 + sensors
    |
    | HTTP/WebSocket telemetry every ~2 seconds
    v
Go API + SQLite
    |                         \
    | live WebSocket             \ 24h fact reduction
    v                             v
React PWA dashboard          OpenCode Go / compatible LLM
    |                             |
    | deterministic alerts        | wording only
    v                             v
browser notifications        grounded answer with source label
```

## Why the assistant does not control the hardware

An LLM can misunderstand language, time out, or return a plausible sentence with a wrong interpretation. A heater, fan or turner is a physical safety boundary.

Therefore:

- alerts are deterministic
- actuator writes stay behind explicit UI controls
- the assistant only receives reduced facts
- the assistant cannot call business services
- model failure falls back to a template or an error, never to an actuator command

## Questions judges may ask

### Is this really AI?

The AI is used for language and question generalization. The measurements, thresholds, data reduction and safety rules are deterministic. That is intentional. The model explains the incubator, it does not run it.

### Why not send every two-second reading to the model?

Because that is noisy and expensive. The server keeps the raw readings for charts and auditability, then summarizes them into 20-minute buckets for analysis. Each bucket keeps its mean, minimum and maximum so short excursions are not erased.

### What happens if the model is down?

The panel falls back to deterministic Indonesian templates generated from the same facts. The UI says the response came straight from the readings.

### What happens if the incubator is offline?

The server can still answer from stored readings. The UI marks the live connection as stale and never calls an old reading current.

### Does it predict hatch success?

No. Temperature and humidity are not enough to know fertilization or embryo viability. PinkEggs deliberately does not claim that.

### Does AI optimize the PID?

No. The PID remains explicit and inspectable. AI control would be an unsafe and untestable boundary for a physical incubator.

### Why is the humidity low in the demo?

If the simulator or test setup reports low humidity, say so directly: "The dashboard is reporting the device, and the alert is doing its job. The humidification model or physical water supply needs attention." Do not hide it with made-up safe colors.

## What to say when demonstrating the AI

> "Ask it about this box, not about incubation in general."

Then tap **Apakah batch berisiko?** and point to:

1. the numeric answer
2. the recorded-facts label
3. the temperature and humidity cards behind it
4. the History page if someone wants proof

The important story is not that a model can talk. The important story is that it can talk **with receipts**.

## What not to claim

Do not claim:

- fully autonomous AI control
- guaranteed hatch rate
- embryo viability prediction
- real-time AI processing of every sensor row
- offline model inference
- a safe temperature band that the firmware does not define

## Last-minute exhibit checklist

- [ ] Open `https://pinkegg.app` on the demo phone.
- [ ] Install it to the home screen.
- [ ] Enable browser notifications from the bell.
- [ ] Ask one preset question while the device is online.
- [ ] Turn the device or simulator off and show that stored history still answers.
- [ ] Confirm the alert bell shows the stale-data alert.
- [ ] Confirm the current answer says either `ditulis dari data tercatat` or `langsung dari pembacaan`.
- [ ] Keep the phone charged and the QR code printed.
- [ ] Do not expose `LLM_API_KEY`, WiFi credentials or `secrets.h` at the booth.
