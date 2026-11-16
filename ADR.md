# Project Decision Log (ADR)

## [2026-05-20] Project Initialization
**Status**: Draft
**Context**: Bootstrapping a new workspace with a unified CI/CD pipeline and containerized backend/frontend architectures.
**Decision**: 
- Using `bun` and `elysia` for a high-performance backend.
- Set up as a monorepo workspace for separation of concerns.
- Implemented baseline GitHub Actions pipeline.
**Trade-offs**:
- Bun is fast but still evolving in terms of full Node compatibility, though it is excellent for Elysia.
- We have paused the frontend setup due to architectural conflicts between Svelte and React-based libraries (Mantine/Tremor).

## [2026-05-20] Frontend Framework Selection
**Status**: Decided
**Context**: The initial requested stack was Svelte + Mantine + Tremor.
**Analysis**: Mantine and Tremor are heavily dependent on React (React Context, Hooks, Virtual DOM). Integrating them into Svelte is an anti-pattern.
**Decision**: Pivoted to React (Vite + TypeScript) for the frontend to fully support Mantine and Tremor components out-of-the-box, sacrificing Svelte's raw performance for React's ecosystem compatibility.
**Trade-offs**: 
- Loss of Svelte's zero-Virtual DOM rendering and small bundle size.
- Gain of rapid dashboard development using robust React component libraries (Mantine + Tremor).

## [2026-05-20] Deployment & CI/CD Pipeline
**Status**: Decided (with security caveat)
**Context**: Required automated deployments to GHCR and a dev server (`137.184.21.113`) for testing before prod.
**Decision**: 
- Configured GitHub Actions to build and push Docker images to `ghcr.io`.
- Added an SCP step to copy `docker-compose.yml` to the dev server (`/opt/elycubator/`).
- Added an SSH step to remotely trigger `docker compose pull` and `docker compose up -d`.
**Security Warning**: The dev server was provided with a plaintext root password. While this is acceptable for a short-lived dev server, **this is an extreme security risk for production**. 
- Action Required: Before moving to prod, SSH Key Authentication MUST be enforced, and root password login must be disabled in `sshd_config`. The CI/CD pipeline relies on a GitHub Secret (`DEV_SERVER_PASSWORD`) currently, which must be swapped to an SSH Private Key (`SERVER_SSH_KEY`) for production.

## [2026-05-20] System Architecture
**Status**: Decided
**Context**: Required a testable architecture that can simulate edge IoT devices (e.g., via Wokwi) interacting with the system.
**Decision**: Implementing a strict **Three-Tier Architecture**:
1. **Presentation Tier (SPA)**: React + Vite application (`apps/web`). Handles client-side rendering and UI dashboards.
2. **Application Tier (API)**: Bun + Elysia backend (`apps/api`). Handles business logic, Wokwi IoT HTTP/WebSocket ingestion, and data validation.
3. **Data Tier (Database)**: PostgreSQL container managed via `docker-compose.yml`, interfaced via Prisma ORM (`apps/api/prisma`).
**Trade-offs**:
- Requires orchestrating three separate layers locally (Web server, API server, Postgres DB), slightly increasing local dev complexity.
- Highly scalable; the API can handle high-throughput Wokwi telemetry independent of UI rendering loads.

## [2026-05-20] IoT Provisioning Protocol (Headless Device)
**Status**: Decided
**Context**: Required a secure flow to pair unclaimed hardware (Wokwi simulators / Headless ESP32s with no LCD) with a user account on the platform.
**Decision**: Implementing a **Captive Portal (AP Mode) Claiming Flow**:
1. **AP Mode**: If the device cannot connect to WiFi, it broadcasts an Access Point (Hotspot) named `Inkubator-<MAC_Address>`.
2. **Captive Portal**: The user connects to this hotspot and navigates to the local portal (`192.168.4.1`).
3. **Provisioning**: The user inputs their Home WiFi credentials. The portal also displays the device's `MAC_Address` and a locally generated, offline 6-digit `Pairing_PIN`.
4. **Online Sync**: The device connects to the internet and beacons Elysia with its `(MAC_Address, Pairing_PIN)`. Elysia registers it as `isClaimed: false`.
5. **The Claim**: The user returns to the Web SPA, clicks "Claim Device", and enters the `MAC_Address` and `Pairing_PIN`. Elysia validates the pair, updates to `isClaimed: true`, and binds it to the User.
**Security Trade-offs**: 
- Solves the "No LCD screen" hardware limitation elegantly.
- Ensures physical proximity because the user must be close enough to connect to the physical device's hotspot to retrieve the `Pairing_PIN`.

## [2026-05-20] Edge Security Architecture
**Status**: Decided
**Context**: Required secure external access to the platform without opening firewall ports to the public internet, plus internal load balancing.
**Decision**: 
1. **Cloudflare Tunnel (`cloudflared`)**: Runs as a sidecar container in `docker-compose.yml`. It creates a secure outbound tunnel to Cloudflare Edge. No inbound ports (80/443) are exposed on the host machine firewall.
2. **Caddy Reverse Proxy**: Acts as the internal entrypoint. `cloudflared` routes traffic to Caddy (`:80`).
3. **Internal Routing**: Caddy reads the path. Anything prefixed with `/api/*` is forwarded to the `api:3000` container. Everything else is forwarded to the `web:80` SPA container.
**Trade-offs**:
- Requires managing a Cloudflare Tunnel Token.
- Provides Enterprise-grade DDoS protection, SSL termination at the edge, and perfectly isolates the API/DB from the public internet.

## [2026-05-22] Observability and Infrastructure Monitoring
**Status**: Decided
**Context**: A droplet outage at `137.184.21.113` was misdiagnosed as an "Nginx failure" despite the architecture running Caddy + Cloudflare Tunnels. The outage was discovered manually rather than through automated alerting, and SSH connectivity was completely severed.
**Decision**: 
- Implement external uptime monitoring (e.g., Uptime Kuma, BetterStack) to monitor the Cloudflare tunnel endpoints.
- Stop relying on manual SSH for primary health checks.
**Trade-offs**:
- Requires setting up and maintaining a separate monitoring service.
- Drastically reduces MTTR (Mean Time To Recovery) and prevents architectural amnesia during panic scenarios.

## [2026-06-17] Dual-Layer Authentication & Identity Verification
**Status**: Decided
**Context**: The initial API had no authentication. The User model lacked a password, and devices could be claimed by passing a raw `userId`. Furthermore, devices identified themselves via MAC address, opening the door for spoofing.
**Decision**: 
1. **User Authentication**: Implemented standard JWT with Argon2id password hashing (`Bun.password`). Short-lived access tokens (15m) are returned to the client, while a long-lived refresh token (7d) is stored in a secure `httpOnly` cookie to prevent XSS exfiltration.
2. **Device Identity**: Devices now share a pre-provisioned symmetric key (`DEVICE_SECRET`). On boot, the ESP32 computes an HMAC-SHA256 signature of its MAC and Pairing PIN to prove identity to the `/init` endpoint. The server responds with a long-lived (30d) JWT Device Token.
3. **Middleware Isolation**: Created distinct `requireUser` and `requireDevice` middlewares with strongly typed payloads (`{ type: "user" | "device" }`) so device tokens can never access user data and vice versa.
**Trade-offs**:
- Requires managing device secrets. In production, each device must have a unique secret flashed at factory time. For current local dev/simulator, a single global `DEVICE_SECRET` is used.
- Refresh tokens are stored in the database as hashes. This means rotating the refresh token invalidates all sessions for that user simultaneously (since we only store one hash per user currently), which is acceptable for MVP but may need a 1-to-many Session table for multi-device login support later.

## [2026-06-17] Native WebSockets vs MQTT for Real-Time IoT
**Status**: Decided
**Context**: An IoT API needs to continuously ingest telemetry and push settings changes down to devices. Traditional HTTP REST relies on heavy polling which drains ESP32 battery life, wastes bandwidth, and creates high latency for user commands. A standard solution is an MQTT broker (e.g. Mosquitto), but this introduces significant infrastructure complexity and duplicates auth logic.
**Decision**: Adopt Native WebSockets (`elysia/ws`) built directly into the Elysia backend API. Devices authenticate once over WS using their JWT, then maintain a persistent bidirectional connection. The API maintains a central memory map of connected sockets. REST endpoints (`/api/device/:id/settings`) trigger an immediate push down the correct socket.
**Trade-offs**:
- Requires ESP32 firmware to support WebSockets (standard via `WebSocketsClient`).
- WebSockets are strictly bound to the specific API server process maintaining the TCP socket. If we scale horizontally to multiple API containers, we will need a Redis PubSub backplane to route push messages to the correct container. Since we are targeting a single monolithic instance currently, this in-memory Map approach is highly optimized and perfectly acceptable.
- Eliminates the need to configure, deploy, or secure a standalone MQTT broker.

## [2026-10-07] Remove dead dev-server deploy job

**Context**: The Hetzner dev server at `137.184.21.113` has been dead for months, causing the `deploy-dev` job (scp + ssh via appleboy actions) to fail every run. Secrets were also wiped.

**Decision**: Deleted the `deploy-dev` job from `ci.yml`. CI now stops at build + push to GHCR. Deployment is local: `docker compose pull && docker compose up -d` (already documented in README).

**Consequences**: No automated remote deployment. Re-add a hardened deploy target (SSH keys, non-root user) only if a live server returns.

## [2026-10-16] ESP32 bring-up: core pinning, radio-first boot, BSSID-pinned connect

**Context**: First physical bring-up of the incubator controller (ESP32-D0WD-V3, 4MB, CH340, MAC `20:50:0d:d2:cc:6c`). The device had to be flashed from this workstation and reach the dashboard at `192.168.1.63:3000`. Blockers found: Arduino core 3.x cannot compile `RBDdimmer` 1.0, WiFi association was unstable at the bench, and the board brownout-reset under transmit load when powered from the workstation USB port.

**Decision**:
1. Pinned the toolchain to `esp32:esp32@2.0.17`. `RBDdimmer` 1.0 uses the pre-3.x timer API (`esp_intr.h`, old `timerBegin` signature). Patching it was rejected explicitly: it drives a mains triac dimmer, and a bad timer port is a fire risk.
2. Firmware order is radio first, actuator last: `WiFi.begin()` runs before `dht`/relay/LCD/PID setup, and `dimmer.begin()` runs last. A brownout during association can otherwise reset the MCU while the triac driver is already armed.
3. Connect strategy is BSSID-pinned first (`LASVEGAS`, channel 1, `30:40:74:BB:E1:8C`) with automatic fallback to a plain scan every failed retry cycle. The active scan was intermittently missing the AP (`status=1 NO_SSID_AVAIL`) on a weak link.
4. Telemetry is posted only when a real DHT read exists (`sensorOk` gate in `kirimUpdate()`). The firmware never posts synthetic values, so an empty dashboard always means a real sensor failure.
5. Full flash backup was read and hash-verified before any write: `~/esp32-backups/inkubator-v1-20261016-174825.bin` (sha256 `c5d94904...4a4fee19`).

**Trade-offs**:
- Pinning the AP BSSID and channel is brittle if the router changes channel or is replaced. The scan fallback bounds the damage to one retry cycle (60s).
- Radio-first boot delays sensor and LCD startup by up to the association window (20s), which is acceptable for an incubator and gives better diagnostics.

**Findings (bench hardware)**:
- Brownout loops under WiFi TX load with laptop USB power. A dedicated 5V supply is required for unattended runs.
- 2.4GHz coverage at the incubator's location is marginal (this workstation sees the same AP at 49/100, the board at -70 to -80 dBm). Association succeeds only intermittently there.
- Device, server, and DB path verified end to end: `telemetry` rows from this board are present in `/data/elycubator.db` (SQLite, `telemetry` table).

**Consequences**:
- `GET /api.php` returns a hardcoded `suhu: null` (`incubationView()`); live temperature is only available through `GET /api/telemetry/history/:deviceId` and the web WS stream. Anything that expects live values from `/api.php` is reading the wrong source.
- The legacy `action=update_esp` write path stores telemetry but does not `broadcastTelemetry()`, so the dashboard live graph does not animate for legacy firmware; data appears on page load or refresh only.

## [2026-10-16] Device attached to the elycubator Go platform (firmware v3.0)

**Context**: The firmware originally spoke the legacy PHP-compatible HTTP API (`GET /api.php?action=update_esp`). The Go service (`apps/api-go`, module `elycubator`) is the real platform and exposes a proper device protocol. The legacy path also resolves `deviceId` to the *first* registered device, so our hardware's telemetry was being written under a simulator's identity (`AA:BB:CC:DD:EE:03`).

**Decision**: Firmware v3.0 speaks the native device protocol:
1. `POST /api/device/init` with `macAddress`, `pairingPin`, and `hmacSignature` = hex HMAC-SHA256(`mac:pin`, `DEVICE_SECRET`), computed on the ESP32 via mbedtls. Returns a 30-day device JWT.
2. `WS /api/device/stream?token=...` carries telemetry up (`temperature`, `humidity`, `lampDuty`, `fanDuty`, `servoAngle`), receives `CONTROL` (snake_case, the local PID target and fan state) and `SETTINGS_UPDATE` (Go struct field names, `TargetTemp`, `Kipas`, `LampEnabled`, `FanEnabled`, ...).
3. The device re-inits if the stream has been down for 5 minutes, which also refreshes the token.
4. Physical buttons now send `{"action":"start"|"stop"}` over the stream instead of the legacy HTTP action.
5. The legacy HTTP posting code was removed from the firmware to prevent double writes under a foreign device identity.

**Findings**:
- `devices.pairing_code` is `UNIQUE`, so a device whose generated PIN collides with an existing row cannot register at all. Registration must use a per-device PIN; this board now uses `205026` (derived from its MAC digits). The failure surfaces as `{"error":"create device failed"}` with no server-side log line, which is worth improving in the Go handler.
- The web dashboard has no device-list endpoint; it discovers the device from the `deviceId` carried in every broadcast `TELEMETRY` frame, then pulls history for it.
- Both pre-existing device rows (`AA:BB:CC:DD:EE:01/03`) are simulator fakes, still unclaimed.

**Consequences**:
- The board's identity is now `d1c19b1c7b9b91753b78cca6d7de7d15` (`20:50:0D:D2:CC:6C`, PIN `205026`), unclaimed until a user claims it in the UI.
- Telemetry now reaches the dashboard live, because the WS path calls `broadcastTelemetry()`.
- The remaining adoption blocker is RF, not protocol: the bench link to the AP is marginal (board sees -70 to -80 dBm while the workstation sees the same AP at 49/100), and TX load on USB power can still brownout the MCU.

## [2026-10-16] ESP32 bring-up part 2: dedicated supply, RF topology, v3.0 hardening

**Context**: After the v3.0 migration to the native device protocol, the remaining blocker was the marginal link to the home AP (2.4GHz channel 1). Master attached a dedicated supply and pointed the board at a new AP (`exusiai-is-wife`).

**Findings**:
- The new AP broadcasts the same SSID on two bands, and its 2.4GHz BSS is hidden (channel 13, locally administered BSSID). A host-side scan only ever showed the 5GHz instance, which caused a wrong first conclusion ("5GHz only, the ESP32 can never join it"). The ESP32 joined the hidden 2.4GHz BSS at **-37 dBm** because `WiFi.begin()` with an explicit SSID probes for hidden networks. Lesson: never rule out an AP from a host `nmcli` scan alone.
- That AP hands out `10.131.240.x`, an isolated network with no route to the server LAN (`192.168.1.0/24`), so `POST /api/device/init` fails with `code=-1` (connection refused). Changing bands does not fix this. The board and the Go server must share a routed network, and the board is always the initiating side, so the fix is either "AP on the server LAN" or "server on the board's network".
- With the dedicated supply, brownout resets dropped to **zero**, including under WS transmit load. The earlier brownout loop was purely power, now confirmed rather than suspected.

**Decisions**:
- Replaced single-network plus BSSID pinning with a small rotation list (`daftarSsid`/`daftarPass`) that cycles on each failed 60s reconnect, so the board survives being moved between known networks without a reflash. BSSID pinning was removed because its value was specific to the old AP and a stale pin is worse than a scan.
- Init retries are throttled (`intervalInitGagal`, 30s) so an unreachable server cannot stall the main loop with a POST attempt every 5s. The failure log now names the likely cause on `code=-1`.
- Telemetry reports the applied dimmer duty (`dayaPemanas`, clamped at 90%) instead of the raw PID output, so the dashboard shows hardware truth rather than PID intention.
- The connect log now records SSID, BSSID, channel, and RSSI, which is what made the dual-band hidden-BSS situation visible.

**Resolved the same evening**: Master put the workstation onto the same phone hotspot as the board, so the server and the device finally share one network (`10.131.240.0/24`). To survive the workstation's address changing every time it joins a different network, the firmware now carries a candidate server list (`daftarServer`) which it probes in order with a 2.5s connect timeout, sticking to whichever answers, instead of one hardcoded address. A stale entry is therefore not fatal.

**Verification (2026-10-16, 12:13 to 12:16)**:
- Board joined the hotspot at **-24 dBm** and `POST /api/device/init` succeeded against `10.131.240.115` with the existing device id.
- The WS stream stayed up for the entire observation window (59 of 60 status samples `WS: OK`, against drops every 30-60s on the home AP).
- Zero brownouts on the dedicated supply, including under transmit load.
- The server commanded the fan on (humidity above 60) and the device applied it, proving the downstream command path.
- The database accumulated 128 rows under the board's own device id, with fresh rows every 5 seconds.

**Remaining fragility**:
- The hotspot issues DHCP leases, so the workstation address can change; if it does, add the new address to `daftarServer`. The list failover means a stale entry is survivable.
- Open hardware question: the dimmer sits at the 90% clamp while the DHT reads a flat 29.3C, so either the mains side of the dimmer is unpowered or the sensor is not inside the heated volume. The PID loop cannot be validated until one of those changes.

## [2026-10-16] Device claiming: PIN-only claim, device lists, claim UI

**Context**: The board registered and streamed, but no user could claim it: `apps/web` had no claim page, there was no device-list endpoint, and `POST /api/device/claim` demanded a MAC address that nobody can read off a physical incubator. The board was also still bare hardware (no lamp, no mains), so the remaining validated work was platform-side.

**Decision**:
1. `POST /api/device/claim` now accepts `pairingPin` alone, resolved through the unique `pairing_code`, or `macAddress` + `pairingPin` as before. When a MAC is supplied the MAC lookup wins, so a wrong PIN returns `401 Invalid Pairing PIN`; PIN-only lookups return `404` for an unknown PIN instead of distinguishing wrong from missing, so the endpoint never confirms whether a PIN exists.
2. New `GET /api/devices` (the caller's claimed devices) and `GET /api/devices/pending` (unclaimed devices that have registered). The pending payload carries `macAddress` + `createdAt` only: exposing `pairing_code` there would let any logged-in account claim other people's hardware, so physical possession of the device stays the proof.
3. New `Devices` page in the SPA (nav between History and Settings): claim form (PIN + nickname), a "waiting to be claimed" list polling every 10s, and "my devices". The claim POST deliberately bypasses the shared `apiFetch` helper and uses a raw `fetch` with the Bearer header, because `apiFetch` treats every 401 as session expiry and a mistyped PIN must not log the user out.
4. `hDeviceInit` no longer rewrites `pairing_code` for already-claimed devices, so a rebooted claimed device cannot resurrect a claimable PIN. A duplicate-PIN insert now returns `409 Pairing PIN is already in use by another device. Generate a new PIN and retry.` instead of the opaque `500 create device failed` that cost 20 minutes during bring-up.
5. `main.go` now serves the SPA with a history fallback: non-API paths that are not real files return `index.html`. This fixes hard reloads of `/devices` (and silently fixed the same latent 404 on `/history` and `/settings`).
6. `sqlc` is not installed on this workstation, so `GetDeviceByPairingCode`, `GetDevicesByUser`, and `GetPendingDevices` were hand-written into `db/sqlc/queries.sql.go` in generated style (tab-indented, same scan order) and their sources added to `db/queries.sql`. Rerun `sqlc generate` next time the tool is available.
7. Client-supplied `nickname` defaults to `Incubator <last 5 of MAC>` when empty, so the device list is never anonymous.

**Verification (2026-10-16 13:08, live platform, image rebuilt and container recreated)**:
- Full suite (29 checks) passes against the real service using throwaway identities derived from the current epoch, never the real board: auth gates, HMAC init, duplicate-PIN 409, pending list contents, no PIN in any list payload, wrong-PIN 401, unknown-PIN 404, claim by PIN, claim by MAC + PIN, already-claimed 400, re-claim with consumed PIN 404, re-init on a claimed device, claimed device absent from pending, and SPA fallback for `/devices`, `/history`, unknown `/api/*` 404, and `/`.
- The deployed container serves the new bundle (`/assets/index-xx0yzyH-.js`, 885 KB, contains the claim page) and the board survived the recreate: the WS reconnected within 5 seconds and telemetry kept landing (760 rows under the board id at check time).

**Consequences**:
- The board `20:50:0D:D2:CC:6C` (PIN `205026`) is now claimable from the browser: log in, open Devices, enter the PIN.
- The pending list also shows the two simulator fakes (`AA:BB:CC:DD:EE:01/03`) created on 2026-10-07 by the repo simulator; they are not real hardware and can be ignored or deleted.
- A `claimtest@local` user exists purely for these tests and owns four dummy devices (`AA:BB:CC:DD:EE:98/99`, `AA:BB:6A:D2:21:CA/CB`). Harmless, but should be deleted if a clean DB is wanted.
- Known ops papercut, now confirmed by reading the code: the SPA never calls `/api/auth/refresh`, so sessions die after the 15-minute access token and require a fresh login. The refresh endpoint exists and works; wiring it up is a small standalone task.
- Still open on the firmware side: the PIN is a hardcoded constant and is displayed nowhere on the device yet. The planned follow-up is PIN generated once into NVS, shown on the LCD, plus the setup captive portal (measured cost: WebServer + DNSServer + Preferences compile clean on core 2.0.17, ~60-100 KB flash against 2.1 MB headroom).

## [2026-10-16] Firmware 3.1: setup portal, NVS identity, server-aware network failover

**Context**: The captive portal had only been proven as a throwaway sketch (`~/Arduino/portal-test`), and a real phone (Realme GT) completed the full first-pairing loop with it: AP joined, probe paths hijacked, form rendered, credentials submitted, board rebooted, station mode connected. Meanwhile the incubator firmware still had compile-time WiFi lists, a hardcoded PIN shown nowhere, and one dangerous failure mode observed in the field: a device that connects to a network which cannot reach the server sits there forever, because the old rotation only reacted to WiFi disconnects, never to server reachability.

**Decision**:
1. Portal folded into the incubator firmware (`3.1`): hold `STOP` during boot (GPIO33 read with `INPUT_PULLUP` before anything else) offers an open AP `Inkubator-Setup-<last 4 of MAC>` with DNS hijack to `192.168.4.1` and 302s for the known captive probes, same page as the proven sketch, now also printing the device PIN and the currently stored SSID.
2. Stored credentials win: NVS namespace `wifi` keys `ssid`/`pass` become the first WiFi candidate, the compiled `daftarSsid` list follows as fallback, duplicate SSIDs are skipped. This is what the earlier portal test had written, so the board picked its provisioning up without re-flashing anything.
3. Identity moves into NVS: key `pin` is generated once with `esp_random()`, random six digits, never rewritten. The LCD alternates between the normal status line and `PIN:xxxxxx blm klaim` until `hDeviceInit` reports `claimed=1`, so the claim code is readable on the device itself.
4. Network rotation now also reacts to server reachability: while the WiFi link is up, a 90s window without any server contact (init success, WS connect, every telemetry send, every inbound WS message) triggers a switch to the next candidate. The failure mode from tonight (`connected` to the home AP, server unreachable) now self-heals instead of parking.
5. Portal mode is deliberately inert: no DHT, no PID, no dimmer, no LEDC, and both relay pins driven to their safe levels before the web server starts, so provisioning can never energize anything. Typing `r` + Enter on the serial console in portal mode wipes the stored credentials.

**Verification (2026-10-16 20:43 to 20:53 WIB, real board, real phone hotspot)**:
- Boot sequence proven in serial: `[NVS] kredensial tersimpan: 'LASVEGAS'` (survived the firmware swap), `[NVS] 2 kandidat jaringan, PIN 147877`, home AP tried first and, when it did not associate, the 60s failover moved to the hotspot on its own.
- `[INIT] OK server=10.131.240.115 ... claimed=0 pin=147877`, WS connected in the same second, telemetry flowing every 5s, grown `fanDuty` command applied from the server side.
- Bug found and fixed during this window: `terakhirServerOk` was only refreshed on connect/init events, so a perfectly healthy 90s-old stream looked like an outage and triggered a rotation (`[WIFI] tersambung tapi server tidak terjangkau, cari jaringan lain` while `WS: OK`). Refreshing it on every telemetry send and inbound WS message fixed it; re-verified with 40 `WS: OK` samples and exactly one legitimate rotation in a 165s window, then 3.5 minutes connected with no disconnect in the server log.
- Telemetry persisted to the database throughout (`/api/telemetry/history/d1c19b1c7b9b91753b78cca6d7de7d15`, rows at 5s cadence).
- PIN rotation confirmed end to end: the old hardcoded PIN now returns `404` from the claim endpoint, the new one lives only in NVS and on the LCD.
- Flash 1003609 bytes (31%), RAM 50620 bytes (15%), so the portal cost roughly nothing against the 2.1 MB headroom.

**Consequences**:
- Claim the board with PIN `147877` (LCD, portal page, or serial), not the old `205026`.
- The board now survives being moved between networks by itself: NVS first, compiled list after, and server reachability decides whether a network is good enough to keep.
- The provisioning path for a brand new board is now: power on, hold `STOP`, join `Inkubator-Setup-XXXX` from a phone, enter home WiFi, claim the PIN on the Devices page. No cable, no compiler.
- Unchanged fragility: the hotspot DHCP address of the workstation can move, and if it does the new address must land in `daftarServer` before the board can find it through the fallback list.
- Unchanged hardware blocker: no lamp or mains load, so PID behavior still cannot be validated.

### Addendum (same night): portal dressed in the platform theme, database cleaned, one ownership incident

**Portal theme**: the setup pages now use the platform's own design tokens, read from the live Mantine theme rather than guessed: body `#242424` (`dark-7`), card and input surface `#2e2e2e` (`dark-6`), border `#424242` (`dark-4`), text `#c9c9c9` (`dark-0`), dimmed `#828282` (`dark-2`), filled button `#3b5bdb` (`indigo-8`, hover `indigo-9`) in dark and `#4c6ef5` (`indigo-6`, hover `indigo-7`) in light, 16px radius everywhere, 14px/600 labels, 36px inputs and buttons, PIN/MAC/SSID in JetBrains Mono to match the monospace fields on the Devices page, plus the `index.css` touch rules (44px buttons, 48px inputs, 16px input font on coarse pointers). Light and dark both come from one `prefers-color-scheme` block, `theme-color` metas color the phone status bar, and the webfont link is loaded non-blocking (`media="print"` + `onload`) so an offline captive portal never waits on Google Fonts and simply keeps the system font. Both schemes were rendered and screenshotted before flashing. Firmware `3.1.1`, 1008889 bytes (32%).

**Build gotcha worth remembering**: once the raw HTML strings grew the extra `link` lines, the Arduino ctags preprocessor stopped emitting a forward prototype for `eventWS`, and the sketch failed with `'eventWS' was not declared in this scope`. Rather than fight the generator, `eventWS` was moved above `mulaiWS`, so the sketch now has no forward references at all and compiles independently of auto-prototypes.

**Database cleanup**: with the app stopped, `claimtest@local`, its four dummy devices, the two simulator fakes, their 6 settings rows and 32750 telemetry rows were deleted from SQLite, then `VACUUM` shrank the file from 9.8 MB to 295 KB. The platform now holds exactly one user (`mai@elycubator.local`), one device (the board, unclaimed, PIN `147877`) and 1062 board telemetry rows.

**Incident (self-inflicted, recorded because it will bite again)**: `docker compose cp` writes the target file as the host uid (`1000:1000`), while the app runs as `10001(app)`, so the swapped database was readable but not writable. SQLite opened it read-only, `hDeviceInit` kept signing device tokens that could not be stored (the `UpdateDeviceToken` result is ignored in that handler), and every WS upgrade then failed the `device.DeviceToken.String != token` check with a bare `401`, while `/api/device/init` answered `200` and looked perfectly healthy. The two diagnostics that pinned it: a token issued seconds earlier by `init` got `401` on the stream URL, and the token stored in the database did not match the one just issued. Fix: `chown app:app` the database through a root one-off container, restart the app; a plain GET on the stream URL then returned `400` (auth passed, upgrade refused), which is the correct signature. Follow-up papercut: check the `UpdateDeviceToken` error in `hDeviceInit` and fail loudly instead of handing out an unstorable token.

**Recovery evidence**: after the fix the board was reset by the serial capture, failed the home AP, rotated itself to the hotspot, hit one transient `code=-1` on the first `init` right after association (caught by the 30s retry, no action needed), then `INIT OK` and `[WS] terhubung`; the closing window showed 30 of 30 samples `WS: OK`, and the database counted 1080 rows with the newest 4 seconds old.

**Still open**: claiming the board from the Devices page with PIN `147877` remains the last human step; the LCD keeps showing the PIN until the next boot after the claim.

## [2026-10-19] Launch hardening: ownership, rate limits, refresh rotation, deploy stack

**Context**: With an Azure credit available and the intent to expose the platform publicly, the service was audited as an internet-facing product rather than a bench tool. The audit found four launch blockers: every device-scoped endpoint authenticated the user and then trusted the `deviceId` from the URL (settings, incubation, servo, history, live socket), the legacy `/api.php` route was registered without any authentication at all and defaulted to the first device, auth endpoints had no throttling against an argon2id cost of 64 MB per hash inside a 512 MB container, and the SPA never called `/api/auth/refresh`, so sessions died after 15 minutes. The device still speaks `http://` and `ws://` to hardcoded LAN addresses, which remains the one launch gap that needs firmware work.

**Decision**:
1. Ownership is now a single gate, `requireOwnedDevice` / `requireOwnedPathDevice` (`authz.go`). It resolves the device and requires `devices.user_id` to equal the token subject, returning `404` on mismatch so device IDs are not enumerable. Applied to settings read and write, servo trigger, all six incubation handlers, telemetry history, and the live socket. The live broadcast no longer keys a wildcard map: each user socket records the user, a wildcard subscription ("all my devices") is filtered against the device owner at broadcast time, and a specific `deviceId` is ownership-checked before the upgrade.
2. `GET /api.php` is deleted, handler file included. It allowed anonymous settings reads, writes and incubation control on the first device. No client in the repo used it; the firmware has spoken the native protocol since v3.0.
3. Rate limiting is in-process token buckets keyed by client IP and route: register 5/min, login 10/min, refresh 30/min, claim 10/min, device init/stream/live 30/min, catch-all 120/min. Client IP is the last hop of `X-Forwarded-For` (what Caddy sets) or the socket address. Request bodies are capped at 128 KB. Login now also normalizes email and bounds password length.
4. Refresh tokens are stored as SHA-256 hex instead of argon2, with a unique index and a direct lookup, and rotate on every use. Replaying a used cookie returns 401. The cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` automatically when the request is TLS or `X-Forwarded-Proto: https`, which Caddy sets. This removes the old full-table argon2 scan that made a sprayed cookie cost `N * 64 MB`.
5. CORS no longer answers `*` with credentials. Headers are emitted only for origins in `CORS_ORIGINS`; the same-origin SPA needs none. Disallowed preflights get 403. Security headers (`nosniff`, `DENY`, referrer, permissions, COOP) are set on every response.
6. `APP_ENV=production` fails fast when `JWT_SECRET` or `DEVICE_SECRET` is missing, still the development default, or too short. Token lifetimes now actually read `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, and `DEVICE_TOKEN_EXPIRES_IN`.
7. The HTTP server has `ReadHeaderTimeout`, read/write/idle timeouts, a header cap, graceful shutdown on SIGTERM, and `GET /api/health` for compose and Caddy probes.
8. Telemetry retention runs hourly (`TELEMETRY_RETENTION_DAYS`, default 30) and checkpoints the WAL after a prune. History `limit` is clamped to 2000.
9. `hDeviceInit` now checks `UpdateDevicePairing` and `UpdateDeviceToken` and returns `500` instead of handing out a token it failed to store. This closes the exact failure mode that produced the invisible `401 Device token revoked` loop after the database ownership incident.
10. Schema application now splits the embedded SQL and executes statement by statement. The new refresh index silently did not exist on the live database until this was fixed, which is the kind of thing `CREATE TABLE IF NOT EXISTS` hides forever. A test now pins the index.
11. Frontend: `src/lib/api.ts` owns the access token, coalesces concurrent refreshes into one call, replays the original request once after a refresh, and emits `auth:expired` when refresh fails. `AuthContext` bootstraps with `/api/auth/me` so an expired access token plus a valid cookie restores the session instead of forcing a login, and the live WebSocket reconnects with backoff after refreshing the token. A signup mode was added to the login page because registration was API-only.
12. Deploy artifacts: `compose.prod.yml` (app behind Caddy, no published app port), a Caddyfile with automatic Let's Encrypt and HSTS, `scripts/backup-db.sh` using SQLite `.backup` plus 30 day pruning, and `DEPLOY.md` with the Azure VM, NSG, DNS label, env, backup, update and rollback runbook. The runtime image now includes the `sqlite3` CLI for backups. CI runs `go vet` and `go test` and tags images with the commit SHA in addition to `latest`.

**Verification (2026-10-19, local Linux, live container rebuilt)**:
- `go test ./...` green: 7 tests covering cross-user access attempts on all 10 device endpoints plus the live socket (owner 200, stranger 404), device token persistence, refresh rotation with replay rejection, login throttling, `/api.php` removal, health, and the refresh index.
- `go vet ./...` clean, Go binary builds, SPA builds clean (`tsc -b && vite build`, 886 KB / 270 KB gzip, unchanged warning about bundle size).
- Live container on `APP_ENV=production`: `/api/health` 200, `/api.php` 404 (and no longer falls through to the SPA), anonymous `/api/devices` and live socket 401, login limiter returned ten 401s then `429` on the eleventh attempt, an `Origin: http://evil.example` request got no `Access-Control-Allow-Origin`, its preflight got 403, and `idx_users_refresh` appeared in the live database without manual migration.

**Consequences**:
- Existing browser sessions are logged out once. The stored refresh values were argon2 strings and the new lookup is SHA-256, so the first visit after deploy requires a login, then refresh works silently for 7 days at a time.
- The board has been sitting in setup portal mode since 2026-10-16 and has sent no telemetry since, so a live device reconnect was not part of this verification. Nothing in this change alters the device wire protocol.
- Per-device secrets remain a factory-time follow-up: every device row still inherits the shared `DEVICE_SECRET`, so anyone who extracts it can re-init a device row. Not addressable in software alone.
- Registration is open by default. For a private instance set `REGISTRATION_ENABLED=false`.
- Rate limiting assumes a proxy that sets `X-Forwarded-For`. Directly exposing port 3000 collapses every client into one bucket; `compose.prod.yml` does not publish it.
- Remaining launch gate is firmware TLS: hostname, `https`/`wss`, and certificate trust or `setInsecure` for the first cut.
- The entire hardening diff, like the Go migration itself, is still uncommitted. Deployment needs a commit and a pushed SHA.

## [2026-10-19] First public deployment: Azure VM, Let's Encrypt, cloud firmware

**Context**: The hardening pass was complete and the VM had been created through the Azure portal. The only credential on the workstation was a downloaded `elycubator_key.pem`, no Azure CLI was logged in, and the public IP had no DNS label. The goal was to put the real service on HTTPS and point the ESP32 at it.

**Deployment**:
1. VM `elycubator` in resource group `elycubator_group`, Malaysia West, `Standard_B2als_v2` (2 vCPU, 4 GiB, 30 GiB Premium SSD), Ubuntu 24.04.5, public IP `172.197.161.174`, admin user `elycubator`. The portal key was moved to `~/.ssh/elycubator_key.pem` with mode 600 (RSA 3072, `SHA256:WwRJ...`). It is SSH-only, never a TLS certificate.
2. Docker 29.9.1 and Compose v5.6.0 installed with the official convenience script, enabled at boot, and `elycubator` added to the docker group.
3. No Azure DNS label, so `SITE_ADDRESS=172-197-161-174.sslip.io`. Caddy solved HTTP-01 and issued a Let's Encrypt certificate on first start. Caddy adds HSTS; the app adds nosniff, frame denial, referrer, permissions, and COOP headers.
4. The image was delivered with `docker save | gzip | ssh docker load` and tagged `ghcr.io/maiaphrodite/elycubator:local`, because the tree is uncommitted and CI has not produced an image. `compose.prod.yml` publishes 80 and 443 on Caddy only; the app stays on internal `expose 3000`.
5. Fresh `JWT_SECRET` and `DEVICE_SECRET` were generated on the VM and stored in `/opt/elycubator/.env` mode 600. The device secret differs from the development value, and firmware v3.2.0 was compiled with the production value.
6. Nightly backup at 02:17 through cron: SQLite `.backup` inside the container, copy to `/opt/elycubator/backups`, prune after 30 days. The first backup passed `pragma integrity_check`.
7. Two GiB of swap was added so a later resize to a 1 GiB VM stays safe.
8. Password hashing is now bounded by a two-slot semaphore (`passwordWorkers`), so a concurrent login burst cannot allocate more than roughly 128 MB of argon2id memory inside the 512 MB container cap. Tests stayed green.

**Verification**:
- `https://172-197-161-174.sslip.io/api/health` returns 200 with HSTS; `/api.php` 404; anonymous `/api/devices` 401.
- Real device init over HTTPS with `mac 20:50:0D:D2:CC:6C`, PIN `147877`, HMAC signed with the production secret: 200, pending device `f54a73529918fe362a8430e8aae45ef4`.
- Device WSS upgrade through Caddy with that token opened; a garbage token was rejected.
- Browser renders the login page including the new signup toggle.

**Firmware v3.2.0** (compiled, not flashed at the time of writing because the board was unplugged): one server `172-197-161-174.sslip.io:443`, `https://` init through `WiFiClientSecure` with `setInsecure()`, `wss://` device stream through `beginSSL` with an empty fingerprint (the library calls `setInsecure()`), production secret injected. 1,009,265 bytes, 32% of flash.

**Cost**: the current shape is about $40.17 per month at Malaysia West list prices (VM $31.24, P4 32 GiB $5.28, static IPv4 $3.65), so $100 lasts roughly 2.5 months. The frugal shape (`B2ats_v2` + `E4` + IP) is about $13.86 per month, roughly 7 months, and is viable because of the swap and the hashing semaphore.

**Open**:
- Device certificate validation is disabled. Follow-up: SNTP plus ISRG Root X1, or a CA bundle.
- SSH 22 is open to the whole internet at the NSG. Restrict it to the admin address.
- Registration is open. Set `REGISTRATION_ENABLED=false` after the owner account exists if the instance is private.
- The running image is a `local` tag built from an uncommitted tree. Commit, push, produce a SHA tag, then pin it.
- `sslip.io` embeds the IP. Fine while the Standard IP stays attached; set an Azure label or an owned domain later.
- The board was still pending and unflashed when this entry was written.

## [2026-10-22] Board WSS 403 and dimmer hard-off

**Context**: The board could init over HTTPS but every WSS upgrade failed with `WS: XX`. Serial WebSockets debug showed the library sending `Origin: file://` by default. The server's `originAllowed` rejects that origin because it has no host, so the upgrade returned 403. Separately, the dimmer still fired a one-tick pulse every half cycle at 0% because `setPower(0)` only sets the minimum pulse; the zero-cross ISR kept arming while `dimState` was `ON`.

**Decision**:
1. Firmware calls `webSocket.setExtraHeaders("")` after `beginSSL`/`begin` so the handshake sends no Origin. The server already allows an empty origin for non-browser clients, and the device socket is JWT-authenticated. No server change.
2. Dimmer starts with `dimmer.begin(NORMAL_MODE, OFF)` and calls `dimmer.setState(OFF)` plus `setPower(0)` whenever duty is zero, including the DHT failsafe. The ESP32 ISR only arms `zeroCross` when `dimState == ON`, so OFF is a true hard-off.
3. Before the board reconnects, the settings row for `f54a73529918fe362a8430e8aae45ef4` was pre-seeded with `lamp_enabled=0` and `fan_enabled=1`. This prevents the default `lamp_enabled=1` from being pushed on a later reconnect, and the claim handler reuses the existing row.

**Verification (2026-10-22 13:02 to 13:04 UTC, real board, clean build)**:
- `101 Switching Protocols`, `WS: OK`, telemetry rows growing (31+), real DHT around 31.5 C / 64% RH.
- Server pushed `SETTINGS_UPDATE` with `LampEnabled:0`; serial stayed `Dimmer: 00%`.
- Lamp is physically disconnected. The no-blink check with mains restored is still the user's step.
- Fan is commanded on because humidity is above 60%; `fanState` ignores `fan_enabled`, so restoring mains will spin the circulation fan.
- LCD remains disabled in firmware (`PAKAI_LCD=false`); backlight only. I2C repair is blocked on identifying the added hardware and checking SDA21/SCL22.

**Consequences**:
- Firmware-only fix; the deployed `local` image did not need a rebuild.
- The board is unclaimed but streaming; claim with PIN `147877` is safe because the settings row is already lamp-off.
- The debug build compiled with `-DDEBUG_ESP_PORT=Serial` was removed after diagnosis; the clean build no longer prints the handshake or token.

### Addendum (2026-10-22): replacement ESP, 20x4 LCD, and new-device lamp default

**Context**: The first board's GPIO21 (SDA) was stuck low even with the internal pull-up; the LCD and backpack were fine. A replacement ESP32-D0WD-V3 (MAC `20:50:0D:29:5F:60`) found the backpack at `0x27`, ACKed direct PCF8574 writes, and ran `lcd.begin(20,4)` plus a four-line write. Firmware 3.2.1 was flashed with `PAKAI_LCD=true`; the LCD initialized on boot. The old board `20:50:0D:D2:CC:6C` is retired.

**Safety catch**: The replacement's first init created a settings row with the schema default `lamp_enabled=1`, so the first WS `SETTINGS_UPDATE` enabled the lamp and the PID commanded 90% before the device was claimed. The lamp was physically disconnected, so there was no heat. The row was updated to `lamp_enabled=0`; the board went offline before it could pull the new value. The next boot will start with the firmware's `lampEnabled=false` and the server's `SETTINGS_UPDATE` at 0, so the dimmer must show `00%` before the lamp is reconnected.

**Decision**: New devices must start lamp-off. Until the server default is changed, every new device row has to be pre-seeded with `lamp_enabled=0` before its first WS connect. The firmware's initial `lampEnabled=false` alone is not enough because the server pushes the stored settings immediately on connect. The replacement device is `a8305ca8281730154266266d1e095ed0`, PIN `912417`, unclaimed; the old PIN `147877` is dead.

### Addendum (2026-10-22): turner relay polarity and LCD backlight recovery

**Context**: On main power the controller streamed cleanly, but the turner motor ran continuously at idle and the 20x4 backlight dropped out about five seconds after boot.

**Root cause**: The relay board is active-low. The fan path already used `LOW` for on, but the turner path used `LOW` for idle and `HIGH` for turning, which energized the turner from the boot `digitalWrite(RELAY_TURNER_PIN, LOW)` onward. The continuously energized turner coil and motor pulled the shared 5V rail down, which matches the backlight dropout. The firmware itself never calls `noBacklight()`.

**Decision**:
- Introduce `RELAY_ON = LOW` and `RELAY_OFF = HIGH` and route both relays through them, plus a `setTurner(bool)` helper. Turner idle is now `HIGH`, turning is `LOW`.
- Re-assert `lcd.backlight()` and `lcd.display()` on every `tampilLCD` refresh so a PCF8574 power glitch cannot leave the display latched dark.
- Firmware 3.2.2 carries both changes.

**Open hardware checks**:
- Measure the 5V rail under turner and fan load. The re-assert masks a latch reset but does not fix a sagging rail.
- If the backlight still drops with a healthy 5V rail, add decoupling at the backpack and move the LCD to its own 5V feed with a shared ground.
- The 5V I2C backpack is still outside ESP32 GPIO spec; a level shifter or 3.3V backpack remains the long-term fix.

### Addendum (2026-10-22): USB serial drops on main power, WiFi log stream

**Context**: With the board powered from the main 5V rail, `/dev/ttyUSB0` disappeared and the laptop could not open the serial monitor. The board kept streaming over WiFi. This is the classic dual-supply and ground-loop failure: USB VBUS and the main 5V rail are tied, and the CH340 drops enumeration.

**Decision**: Firmware 3.3.0 tees every sketch `Serial` write to a Telnet client on port 23 through a `TeePrint` wrapper, without rewriting call sites. mDNS advertises `inkubator.local`; the LCD alternates the device IP with status so the address is visible without serial. Flash with main power off and USB only; run with main power on and USB disconnected. A data-only USB cable with VBUS cut, or a USB isolator, is the safe way to keep USB serial while main is live. The Telnet path is diagnostic only and does not change telemetry or control.

## [2026-11-16] Local UI/UX rig: scratch stack on :3100 and :5173

**Status**: Decided

**Context**: UI and UX work needs a running dashboard with live telemetry, editable with hot reload. The workstation already runs the production image in Docker on :3000 (healthy, owns the real database at `/data/elycubator.db`). Editing against that container means restyling the deployed app and writing into real data, and dirty `apps/web` changes would only appear after a full image rebuild.

**Decision**: `scripts/dev-local.sh` runs a separate stack and never touches :3000:

- API: the Go server built from `apps/api-go` on **:3100**, with its own SQLite file in `.local-dev/` (gitignored alongside the binary, logs and pidfiles). `APP_ENV=development`, and `CORS_ORIGINS` covers the Vite origins so the origin check on `/api/device/live` passes for a real browser.
- Simulator: `apps/simulator` registers MAC `AA:BB:CC:DD:EE:99`, PIN `424242` against :3100, so the dashboard has a live PID loop instead of an empty chart. The script claims that device to a dev user (`dev@pinkegg.local`) and starts an incubation cycle so phase data is real.
- Web: `bunx vite` on **:5173**. `apps/web/vite.config.ts` now reads `VITE_API_TARGET` (default unchanged at `http://127.0.0.1:3000`) so the proxy points at the scratch API. HTTP and WebSocket both go through the proxy, keeping the app same-origin as in production.
- `up`, `down`, `status`, `logs` and `reset` subcommands; `reset` wipes `.local-dev/` behind a path guard.

**Trade-offs**:
- Two stacks run at once, so the port has to be remembered when reading logs. The startup banner prints the URL, credentials and log directory.
- The rig keeps its own empty database, so it does not show production history or devices. That is the point: seed, claim and break freely.

**Verification (2026-11-16 04:40, local)**:
- `go build` clean, `bunx tsc -b` clean, `bunx vite build` clean.
- `/api/health` answers both directly on :3100 and through the Vite proxy on :5173.
- A browser-shaped WebSocket client (Origin `http://127.0.0.1:5173`) received `TELEMETRY` frames through the proxy; the simulator logged `Device Connected`; telemetry history returned rows; incubation reported `hari_ke: 1`.
- Screenshots of all four pages at 1440x1000 and of the dashboard at 390x844 were captured through headless Chromium over CDP.

**UI defects observed on those first screenshots (open, not yet fixed)**:
- History: Y-axis tick labels are clipped to one or two characters (`36.7` renders as `.7`). `TelemetryMiniChart` uses `width={36}` with `margin.left: -20`; the negative margin pushes the labels out of the plot area.
- History and Readings: seeded rows are rendered seven hours behind live rows, so one list mixes `09:40 PM` (seeded) with `04:42 AM` (live). `useTelemetryStream.seedHistory` calls `new Date(row.timestamp)` on SQLite's UTC `YYYY-MM-DD HH:MM:SS`, which JS parses as local time. `DevicesPage.fmtTime` already appends `Z` and is correct, so the parse belongs in one shared helper.
- Dashboard on a 390px viewport: each stat card is about 370px tall, so the actuators card sits below the fold on the primary mobile target.
- Dashboard: the sparkline at `opacity: 0.15` is painted behind the value text and reads as a smudge rather than data.
- Dashboard: the page repeats the word Pinkegg directly under a header that already shows it.
- Settings: the `Accordion` has `chevronPosition="left"` but still renders its section icon on the far right, so the row has an icon at each end.

## [2026-11-16] PinkEggs rebrand: new logo and a cream/espresso theme

**Status**: Decided

**Context**: A new logo arrived, replacing the olive egg mark. The delivered file is a single flat cream ink (`#FDE4BA`) on transparency, stacked mark over wordmark, so it carries no second colour and no baked background.

**Decision**:
- **Assets**, generated by `scripts/build-brand-assets.py` into `apps/web/public/brand/`: the delivered lockup is split into mark and lockup, each recoloured to two single-ink PNGs (cream for dark surfaces, espresso for light ones), plus `favicon.png` and `apple-touch-icon.png` on an ink tile. `public/favicon.svg` is deleted; the tab icon is now the real mark.
- **Palette**: `BRAND_BASE = "#FDE4BA"` is sampled from the artwork and is the single source of truth. The brand ramp stays generated, with the dark end deepened so shade 9 (`#383229`) is the espresso that filled controls use in light mode; shade 3 (`#FEEED4`) is what they use in dark mode. `cream` is a hand-stepped paper ramp (page `#F8F1E1`, cards `#FFFDF8`), and `dark` is now warm espresso instead of green-black so both schemes echo the logo tile. `amber` and `sage` are untouched: they are semantic (heat, moisture), not brand.
- `BrandMark` / `BrandLockup` pick the recolour that matches the active colour scheme. Header shows the mark plus wordmark on wide screens and the mark alone under 36em; the sign-in screen shows the full lockup.
- Wordmark casing follows the artwork (`PinkEggs`) in the UI: header, sign-in lockup, document title, favicon. Package names, README and API stay `pinkegg` until a naming decision is made.
- The dashboard heading is now `Dashboard`. It used to repeat the brand name directly under a header that already carried it; this closes that item from the previous entry.

**Two defects found and fixed while retuning**:
1. **Dark-mode filled controls were white text on cream.** Mantine's `defaultVariantColorsResolver` calls `parseThemeColor` without a `colorScheme`, so it picks the text colour from the *light-mode* primary shade, while the background comes from a CSS variable that does follow the scheme. With `primaryShade` flipped per scheme those disagree. Fixed with a `variantColorResolver` wrapper in `theme.ts` that defers the label colour to `--brand-filled-contrast`, flipped per scheme in `index.css`. The bug predates this change (the old pale-yellow dark-mode buttons had it too) and only became obvious once the brand turned cream.
2. **Settings accordion was an unreadable white slab in dark mode.** It hardcoded `--mantine-color-cream-0`. Replaced with a new `--surface-raised` token that flips between cream-0 and dark-6.

**Verification (2026-11-16 05:15, local rig)**:
- `bunx tsc -b` clean, `bunx vite build` clean, generated assets present in `dist/`.
- Screenshots captured through headless Chromium at 1440 wide for dashboard, login and settings in both schemes, plus the dashboard at 390x844.
- Contrast measured in the live page over CDP rather than eyeballed: light mode `#FFFFFF` on `#383229`, dark mode `#1A1611` on `#FEEED4`.
- `bunx eslint .` reports the same 7 errors and 2 warnings as before this change, all in files this work did not touch.

**Open**: the History chart defects from the previous entry (clipped Y labels, seven-hour time skew in seeded rows) are still open, as is the mobile stat-card height.

## [2026-11-16] Dashboard density pass and a thumb-first actuator deck

**Status**: Decided

**Context**: The dashboard read as empty on desktop and the actuator controls were fiddly on a phone. A design review of the current page found three separate encodings of one bit (ON badge, duty percent, Mantine `Switch`), a full-bleed `Progress` bar that reads as a draggable slider but is not one, ghost sparklines painted behind the value text, a humidity target hardcoded at `55.0%` while `settings.targetHumidity` existed, an invented `37.5` temperature fallback next to two real setpoints (37.8 setter, 37.2 hatcher), and no way to tell a frozen socket from a stable incubator.

**Decision**:
- **Actuator deck**: each tile is the control, a `role="switch"` button covering the whole card, so the target is thumb sized and nothing small sits at the row edge. Vocabulary splits permission from output: `Off`, `Armed · idle`, `Armed · 62%`. The duty band under each tile is the last 24 samples from the live buffer, which answers "coasting or fighting" and replaces the slider-looking bar. The turner is a full-width bar with its configured schedule, a `Turn now` action and three seconds of feedback. One legend line explains armed versus output.
- **New cards**: `CycleCard` (day, elapsed, auto/manual, days until the day-19 hatcher switch), `ControlLoopCard` (gains in use plus both stored profiles, so the numbers have a visible source), `DeviceCard` (nickname, MAC, last frame age, buffer size, live or stale verdict).
- **Stat cards**: setpoint delta chip, targets read from settings and the incubation payload, and the trend moved out from behind the text into a strip along the bottom with min/max and a dashed target line.
- **Header**: a `live 0s` pill driven by the last frame timestamp, a stale banner past eight seconds, an export button labelled with its row count, and the clock labelled as the reading time rather than "now".
- **Honesty rule**: nothing on this page is invented. No hatch date, no cycle length, no next-turn countdown, and no green/amber safe band, because the payload carries no cycle length, no last-turn timestamp and no tolerance field. Where such a number would go, the card says what it actually knows.
- The telemetry store now exposes a `settings` snapshot and `lastReceivedAt`, and `refreshDeviceSettings()` is called after a save on the settings screen so the dashboard's targets do not drift.

**Fixed in passing**: `useTelemetryStream.seedHistory` parsed SQLite's UTC `YYYY-MM-DD HH:MM:SS` with `new Date()`, so seeded rows rendered seven hours behind live ones (the defect recorded in the previous entry). Both it and `DevicesPage` now use `parseServerTimestamp` in `src/lib/time.ts`.

**Verification (2026-11-16 12:20, local rig)**:
- `bunx tsc -b` and `bunx vite build` clean. `bunx eslint .` stays at the pre-existing 7 errors and 2 warnings, none in the files this work added or rewrote. The one new lint hit, `Date.now()` during render in `CycleCard`, was fixed with a `useNow` clock hook rather than suppressed.
- Screenshots at 1440 light and dark, and at 390 wide. Mobile needed two corrections found by looking: the page header collided with its own controls, and the gains row truncated at two columns.
- Sparkline rendering confirmed in the live DOM (`.recharts-responsive-container` at 264x40 with an `svg` child). A blank strip in one full-page capture was a `captureBeyondViewport` artifact, not a defect.

**Open**: the History Y-axis label clipping from the previous entry, and multi-account seeding (the dev rig has one account, created by `scripts/dev-local.sh`).

### Addendum (2026-11-16): design audit run through the OpenDesign skill pack

**Context**: the first pass at the dashboard was reviewed by a generic subagent. The requested tool was OpenDesign, whose skill pack lives at `~/.dsh/profiles/desktop.bak/node_modules/open-design/skills`. Two things about that install: it sits in a backup profile rather than the active one, so its skills never appeared in the session skill catalog, and its daemon is not built (`apps/daemon/dist/cli.js` missing), so `od` cannot run without a `pnpm bootstrap` on Node 24 plus a local agent CLI. Most of its entries are catalogue stubs that only point upstream, but `redesign-skill`, `emil-design-eng` and `taste-skill` carry the real rubric, and those were applied directly.

**Findings and fixes**:

| Before | After | Why |
| --- | --- | --- |
| No focus style on any `UnstyledButton` (nav, tiles, sign-in toggle) | `:focus-visible` outline at 2px brand-7 with 2px offset | Keyboard navigation was invisible; the audit calls this an accessibility requirement, not a nicety |
| No skip link | `.skip-link` above the shell, revealed on focus, targeting `#main-content` | Lets a keyboard user bypass the nav |
| `transition: "all 200ms ease"` on bottom nav | `background-color 200ms ease, color 200ms ease` | Named properties only; `all` animates layout by accident |
| Tile transitions nested inside `@media (hover: hover)`, so the base rule only existed on hover-capable devices | Base `.tile` transition unconditional, `:hover` gated behind the media query | The transition has to exist regardless; only the hover response is device dependent |
| No hover or press feedback on the actuator tiles | `translateY(-1px)` plus a brand-tinted shadow on hover, existing `scale(0.98)` on press | Desktop users got no signal that the tile is a control |
| Every card carried `withBorder` on a near-white surface over a cream page | Borders removed, surface contrast carries the elevation | The audit names "border + shadow + white background" as the generic card look |
| First frame before data arrived rendered `0.0°C` and `0.0%` | Values render `—` and deltas are withheld until the first frame | A zero reading is a lie that looks like a real measurement |
| Device card showed "Unnamed device" while `/api/devices` was in flight | `Skeleton` placeholders for name and MAC | Loading state instead of a wrong answer |
| Icon strokes mixed 1.5, 1.6, 1.8, 2.2 | 1.6 for UI icons, thicker only for the active nav glyph | Inconsistent stroke weight reads as sloppy |

**Deliberate deviations from the pack, with reasons**: the audit dislikes a left sidebar, three equal stat columns, and more than one accent colour. All three are kept here. A data dashboard needs peer metrics at equal visual weight, the sidebar is the established navigation for four sections, and amber and sage are semantic (heat and moisture), not decorative accents.

**Verification**: `tsc -b` and `vite build` clean; `eslint` unchanged at the pre-existing 7 errors and 2 warnings, none in touched files. The focus rule and the tile transition were confirmed in the live page over CDP (`transitionProperty` now reads `transform, box-shadow, background-color, border-color` at 0.16s) after the first attempt was caught shipping a dead rule.

**Observed while reviewing**: the simulator has pinned humidity at its 10% floor with the fan at 83% and the humidity PID unable to recover. The dashboard is reporting that faithfully; the sim's moisture model is the thing at fault.

### Addendum (2026-11-16): softer deck, readable chart, phone-first layout

**Context**: owner feedback on the density pass. Three complaints: the tile palette was too sharp, the history chart's timeframe colour blended into itself, and the mobile view still needed work.

| Before | After | Why |
| --- | --- | --- |
| Armed tiles used a saturated `-5` border against a `-light` fill, and the icon sat in a solid dark disc | Border and fill are `color-mix` blends of the hue into `--mantine-color-body` (26% / 9%), icon chip is `variant="light"` | Saturated edges on pale surfaces read as alarms rather than states; mixing into the body tone keeps the same hue in both schemes without the shout |
| Duty bars at `-5`, opacity ramp 0.35 to 1 | `-4`, ramp 0.30 to 0.85 | Same information, less glare |
| `Turn now` was brand-5 at 12% into a cream card, effectively invisible | 38% of brand-8 for the border, 26% of brand-5 for the fill | It is the one real action in the deck and it has to look pressable |
| Chart series were green for temperature and taupe for humidity, against the dashboard's amber-heat / sage-moisture language | Amber for temperature, sage for humidity, matching the stat cards | Two pages describing the same quantity in two colours is a bug in the product's vocabulary |
| Y labels clipped at 2 characters (`36.7` rendered `.7`), 10px axis text at 35% alpha | `width={44}`, no negative left margin, 11px text at 62% alpha, grid at 10% | The recorded open defect. The labels were being pushed out of the plot by `margin.left: -20` |
| Every X tick read `13:00` because the buffer is only ~100 seconds | Ticks keep seconds with a 68px gap | Minute resolution collapses to one repeated label at this window size |
| 12-hour clock across charts and readings (`09:40 PM` / `04:42 AM`) | 24-hour everywhere | Telemetry logs do not need AM and PM, and it shortens every axis label |
| Phone: three full-width stat cards, controls pushed below the fold | Two-up compact cards (no icon, sentence-case label, delta under the value, `-> target`) with the cycle card spanning, so the actuator deck starts around 590px | The audit's alert, state, control ordering. Controls were unreachable without scrolling |
| Phone header wrapped into three ragged rows and clipped `reading 13:01` | Title and controls share one row, the reading line sits under them | Fewer rows, nothing truncating |
| Readings rows squeezed four badges into a no-wrap row and rendered `37...`, `6...` | Time on its own line, badges wrap below | Values have to be readable, not decorative |
| Three stat columns started at 768px while the 268px navbar leaves about 600px | Three columns only from 62em, two below | At 900px the value text was clipped mid-number (`38.6` with no unit), which is how this was found |
| Delta chip could shrink to a dot inside a no-wrap row | Chip pinned with `flex-shrink: 0`, row wraps, value steps 1.65 / 1.8 / 2rem | A delta that vanishes is worse than one on its own line |

**Verification**: `tsc -b` and `vite build` clean. `eslint` now reports 6 errors and 2 warnings (down from 7) because a `prefer-const` was fixed in the telemetry store; the rest are the same pre-existing findings. Checked at 390, 900 and 1440 wide, dashboard and history, light and dark.

**Still open**: `README.md` and `package.json` still say `pinkegg` while the product calls itself PinkEggs, and the History page has no time-range control (the client buffer is the only window).

### Addendum (2026-11-17): the chart axis bug was a colour-scheme detection bug

**Context**: after the chart cleanup the owner still saw axis tick labels blending into the card on a dark screen. The colour values in `HistoryPage` were already correct (`rgba(255,255,255,0.70)` for dark), so the values were not the problem.

**Root cause**: `HistoryPage` read `useMantineColorScheme().colorScheme` and compared it to `"dark"`. With `defaultColorScheme="auto"` that value is the string `"auto"` whenever the user never touches the theme toggle, even while Mantine renders a dark UI from the OS preference. `isDark` was therefore false, and the chart drew its light-mode brown tick labels on a dark card.

**Why it survived verification**: the screenshot harness forced `mantine-color-scheme-value` into `localStorage` on every run, which is exactly the state that avoids this branch. Every "dark mode" screenshot was taken with an explicitly stored `"dark"`, never with `"auto"` plus an OS preference.

**Fix**: `useComputedColorScheme("light")`, which resolves `auto` against the live media query. The harness gained `--auto`, which skips the localStorage write and emulates `prefers-color-scheme` over CDP, so that state is now reproducible. Its flag parser also stopped swallowing a following flag as a value (`--auto --dark` used to evaluate as `auto="--dark"` and render light).

**Verification**: reproduced the failure with `--auto --dark` first, then re-shot after the fix and confirmed the labels render at full contrast; `--auto` in light mode checked for regressions; series paths confirmed present in the DOM (`.recharts-area-area` with path data) rather than assumed from a screenshot.

### Addendum (2026-11-17): status pill replaced by a frame trace, icons moved to MingCute

**Context**: the owner rejected the dot-in-a-pill status indicators as generic, and asked for MingCute icons.

**Decision, status indicator**: the header pill, the dashboard `live Ns` pill and the device card `LIVE` badge are all replaced by one component, `LinkTrace`. It draws a 16-sample strip at one sample per second: a frame arriving in a second pushes a spike, silence leaves the baseline. The age sits beside it in mono. Live and stale differ by shape as well as hue, so a dead socket produces a visibly flat line rather than a recoloured dot. Colour follows `--mantine-color-text` so it reads in both schemes, and only a stall switches to amber. It is announced as `role="status"` with a sentence describing live or stalled plus the age.

Alternatives considered and rejected: signal-strength bars (reads as network, not telemetry), a pulsing dot (still a dot), a tweened number alone (no shape change when stalled), and a sonar ring around the brand mark (decorative, no data in it).

**Decision, icons**: `@tabler/icons-react` is removed and `@mingcute/react` (Core Regular) replaces it across all eleven files that used icons, imported from `@mingcute/react/core-regular`. MingCute draws its own strokes, so every `stroke` prop was dropped. Bundle went from 890 kB to 922 kB minified for roughly 25 icons, accepted for the rounder, more distinctive set.

**Incident worth remembering**: the icon swap was mechanical, and the regex used to strip `stroke={...}` also stripped recharts' `stroke` props on `CartesianGrid`, `ReferenceLine` and `Area`, which silently uncoloured the history chart. TypeScript caught it only because the now-unused `gridColor` variable tripped `noUnusedLocals`. Lesson: mechanical rewrites need a scope guard (only match inside icon JSX), not just a passing build.

**Verification**: `tsc -b` and `vite build` clean, `eslint` at the same 6 errors and 2 warnings. Trace confirmed in the live page at 1440 light, 1440 dark and 390 wide, and the chart re-checked after restoring the stripped strokes.

### Addendum (2026-11-17): one design language across every route

**Context**: the dashboard had moved to the new language (borderless cards, `SectionHeader`, squared controls, MingCute, 24h mono data) while History, Devices and Settings still used `padding="lg" radius="xl" withBorder` cards, `Group` plus `Text` fake headers, `Title order={5}` section titles, icon-only action buttons, and pill-shaped buttons and badges.

**Decision**:
- **Chrome lives in the theme.** `Card: padding "md", radius "lg"` and `Paper: p "md", radius "lg"`. Dashboard cards stopped passing their own padding and radius, so a card is a card everywhere.
- **Two shared primitives.** `PageHeader` (title, optional mono subtitle, optional right-hand actions) now renders the header of all four routes; `SectionHeader` (icon, title, optional trailing) renders every card header. `SectionHeader` moved out of the dashboard folder's private use and is imported by three pages.
- **No borders on content cards.** Separation comes from the surface tone, matching the dashboard. Devices and Settings lost 6 `withBorder` props; the login `Paper` lost its border and shadow.
- **Radius language.** Buttons and `ActionIcon` went from `xl` (a capsule on a 36px control) to `lg`, matching the card radius; `Badge` went to `sm`. This is what removes the last of the pill silhouette the owner objected to.
- **Action buttons are labelled.** History's icon-only export became `50 rows` with a download icon; Devices and Settings `Refresh` buttons use the same `compact-sm` default variant, so the header's right edge behaves identically per page.
- **Vocabulary.** `H-1` in the settings incubation card and `Setter (H-1…H-18)` in the PID block became `day 1` and `Setter (day 1 to 18)`, matching `Day 1` on the dashboard.
- **Login** sits on the same raised surface as the shell instead of a white page with a bordered box.

**Consequence worth naming**: the login page is now a bare form on cream with no card. It reads calmer and matches, but it loses the framing that visually separated "sign in" from the product; if that framing is wanted back it should return as a card like every other surface, not as a bordered `Paper`.

**Verification**: `tsc -b`, `vite build` clean, `eslint` at the pre-existing 6 errors and 2 warnings. Screenshots of all four routes at 1440 in light, plus Settings at 1440 in auto dark and Devices at 390 wide.

### Addendum (2026-11-17): motion layer

**Context**: requested motion pass, run against OpenDesign's motion rubrics (`emil-design-eng`, `ui-animation`). Both carry real rule content; the OpenDesign daemon is still unbuilt, so these are used as the specification rather than driven through the product UI.

**Rules taken from the pack and applied literally**:
- routine UI under 300ms; press 100-160ms; page enter 240-300ms
- entrances use a strong ease-out curve (`cubic-bezier(0.22,1,0.36,1)`), never `ease-in`
- staggered children 30-80ms apart and never blocking input
- `transform` and `opacity` only, never layout properties
- one entrance per container: the dashboard staggers its cards, so the route transition is opacity-only rather than a second motion stack
- reduced motion handled in JS, because a CSS media query cannot stop framer-motion

**What was added**: `src/lib/motion.ts` holds the tokens (curves, durations, stagger step) plus the shared variants `pageEnter`, `staggerContainer`, `riseIn`, `slideDown`, `tapScale`. The app is wrapped in `MotionConfig reducedMotion="user"`. Route changes crossfade the content area keyed on `location.pathname`. Dashboard cards cascade in from the shared `riseIn` instead of three near-identical local variants, and the stale-telemetry banner slides down when it appears. The turner control spins with a linear loop while a turn is in flight and settles on a spring to the reported angle. Stat values pop in once when data replaces the `—` placeholder, keyed on empty-versus-data so it does not re-fire every two seconds. CSS keeps colour feedback under reduced motion and drops the travel.

**What was deliberately not animated**:
- the telemetry numbers every tick: they update every 2s, which is exactly the "user sees it often" case the rules say not to animate
- the readings list and duty bars: same reason, plus per-frame re-animation makes data look unstable
- the liveness strip: the shape already carries the state; pulsing it would be decoration on top of information

**Verification**: `tsc -b` and `vite build` clean, `eslint` unchanged at the pre-existing 6 errors and 2 warnings. Reduced motion was measured rather than assumed: the probe now takes a `--reduce` flag that emulates `prefers-reduced-motion` over CDP, and polling the peak `translateY` across the entrance gives **10px normally and 0px under reduce**, with the tile transition collapsing to `background-color, border-color, color`. An earlier attempt to measure this by counting elements with an inline `transform` was wrong: framer leaves a settled `transform: none`, so the count was identical in both modes and proved nothing.

### Addendum (2026-11-17): plain vocabulary pass

**Context**: the owner called the copy corny. The worst offender was `Armed`, a term invented here that no incubator operator would use, plus a set of phrases that described the implementation instead of the device.

**Rules adopted**: one factual word per state, no invented jargon, no second-person instruction inside a data card, and no mention of transport internals (`frame`, `buffer`) in the interface.

| Before | After | Why |
| --- | --- | --- |
| `Armed · 47%` / `Armed · idle` | `On · 47%` / `On · idle` | The switch is on or off. That is all it is |
| `tap a tile to arm or disarm` | `tap to switch on or off` | Same action, no vocabulary to learn |
| `Armed means allowed to run. Output is what the controller asks for right now.` | `The switch turns the output on or off. The percentage is what the controller is driving now.` | Describes the device, not a permissions model |
| `Control loop` / `gains being applied right now` | `PID control` | Names the thing; the sentence added nothing |
| `in use` badge | `active` | Plainer |
| `Hatcher profile in 18 days` | `Hatcher phase in 18 days` | Incubation has phases; profiles are a settings concept |
| `Last frame` / `Buffer` | `Last reading` / `Readings` | `frame` and `buffer` are transport internals |
| `Telemetry is arriving. Values above are current.` | `Receiving data.` | Say the state, stop |
| `No fresh telemetry. Readings above may be frozen.` | `No data arriving. Values may be out of date.` | `frozen` was drama |
| `Telemetry looks frozen` (banner) | `No new data` | Same |
| `Live charts` | `Charts` | They are the only charts |
| `50 readings buffered` | `50 readings` | Buffer is an implementation detail |
| `reading 14:22:36` | `last reading 14:22:36` | Unambiguous timestamp meaning |
| `Dark Mode`, `Save PID Profiles`, `Test Turner` | `Dark mode`, `Save PID profiles`, `Test turner` | Sentence case everywhere |
| `Sign in to manage your smart incubators` | `Sign in to manage your incubators` | "smart" is filler |
| Screen-reader labels mentioning `frame` and `stalled` | `No data for 42s`, `Receiving data, updated 0.4s ago` | Same rule applies to non-visual copy |

**Kept deliberately**: `Setter` / `Hatcher` (real incubation phases), `PID` and `Kp/Ki/Kd` (the audience is the person tuning them), `Claim` for device ownership (matches the API and the pairing flow), and `Turn now` (an imperative that names exactly what happens).

**Verification**: `tsc -b` and `vite build` clean, `eslint` unchanged at the pre-existing 6 errors and 2 warnings, and the dashboard plus settings re-shot to confirm the shorter labels do not reflow the tiles.
