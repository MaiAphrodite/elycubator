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
