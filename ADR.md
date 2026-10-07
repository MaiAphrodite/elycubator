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
