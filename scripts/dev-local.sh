#!/usr/bin/env bash
# Local UI/UX development rig.
#
# Runs a scratch stack so the dashboard can be edited and exercised without
# touching the production container that owns :3000:
#
#   API        Go server + working copy of the SQLite database   :3100
#   Simulator  feeds live telemetry into that API                (no port)
#   Web        Vite dev server with HMR                          :5173
#
# The API keeps its database, binary, logs and pidfiles inside `.local-dev/`,
# which is gitignored, so wiping it never touches real data.
#
# Usage: scripts/dev-local.sh [up|down|status|logs|reset]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/.local-dev"
LOG_DIR="$DEV_DIR/logs"
RUN_DIR="$DEV_DIR/run"
BIN="$DEV_DIR/bin/elycubator"
DB="$DEV_DIR/elycubator.db"

API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-5173}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
API_URL="http://127.0.0.1:$API_PORT"
WEB_URL="http://$WEB_HOST:$WEB_PORT"

DEV_EMAIL="${DEV_EMAIL:-dev@pinkegg.local}"
DEV_PASSWORD="${DEV_PASSWORD:-devpassword123}"
DEV_NAME="${DEV_NAME:-Dev}"
SIM_MAC="${SIM_MAC:-AA:BB:CC:DD:EE:99}"
SIM_PIN="${SIM_PIN:-424242}"
DEVICE_NICKNAME="${DEVICE_NICKNAME:-Dev Incubator}"

log() { printf 'dev-local: %s\n' "$*"; }
die() { printf 'dev-local: %s\n' "$*" >&2; exit 1; }

load_env() {
  [[ -f "$ROOT/.env" ]] || die "missing $ROOT/.env (cp .env.example .env)"
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
}

pidfile() { printf '%s/%s.pid' "$RUN_DIR" "$1"; }

is_running() {
  local file
  file=$(pidfile "$1")
  [[ -f "$file" ]] && kill -0 "$(cat "$file")" 2>/dev/null
}

start_bg() {
  local name=$1 dir=$2
  shift 2
  local file
  file=$(pidfile "$name")
  if is_running "$name"; then
    log "$name already running (pid $(cat "$file"))"
    return
  fi
  : >"$LOG_DIR/$name.log"
  ( cd "$dir" && exec setsid nohup "$@" ) >>"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$file"
  log "$name started (pid $(cat "$file"))"
}

stop_bg() {
  local name=$1 file
  file=$(pidfile "$name")
  [[ -f "$file" ]] || return 0
  local pid
  pid=$(cat "$file")
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    kill -TERM -- "-$pid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
    log "$name stopped (pid $pid)"
  fi
  rm -f "$file"
}

wait_for_http() {
  local url=$1 label=$2 timeout=${3:-60} i=0
  until curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null; do
    i=$((i + 1))
    if (( i > timeout * 4 )); then
      die "$label never answered at $url, see $LOG_DIR"
    fi
    sleep 0.25
  done
}

build_api() {
  mkdir -p "$DEV_DIR/bin"
  log "building API"
  ( cd "$ROOT/apps/api-go" && go build -trimpath -o "$BIN" . ) || die "go build failed"
}

auth_json() { # method path token [body]
  local method=$1 path=$2 token=$3 body=${4:-}
  local args=(-sS -X "$method" "$API_URL$path" -H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  curl "${args[@]}"
}

seed_user() {
  local body
  body=$(curl -sS -X POST "$API_URL/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$DEV_EMAIL\",\"password\":\"$DEV_PASSWORD\",\"name\":\"$DEV_NAME\"}")
  if [[ $(jq -r '.success // false' <<<"$body") == "true" ]]; then
    log "created dev user $DEV_EMAIL"
    return
  fi
  grep -q 'already registered' <<<"$body" || die "register failed: $body"
  log "reusing dev user $DEV_EMAIL"
}

login_token() {
  local token
  token=$(curl -sS -X POST "$API_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$DEV_EMAIL\",\"password\":\"$DEV_PASSWORD\"}" |
    jq -r '.data.accessToken // empty')
  [[ -n "$token" ]] || die "login failed for $DEV_EMAIL"
  printf '%s' "$token"
}

# The simulator registers itself on boot, so wait for its MAC to appear in the
# pending list, claim it, and hand ownership to the dev user.
claim_device() {
  local token=$1 i
  for ((i = 0; i < 90; i++)); do
    if auth_json GET /api/devices/pending "$token" |
      jq -e --arg mac "$SIM_MAC" '.data[]? | select(.macAddress == $mac)' >/dev/null; then
      local claim
      claim=$(auth_json POST /api/device/claim "$token" \
        "{\"macAddress\":\"$SIM_MAC\",\"pairingPin\":\"$SIM_PIN\",\"nickname\":\"$DEVICE_NICKNAME\"}")
      jq -e '.success == true' <<<"$claim" >/dev/null || die "claim failed: $claim"
      log "claimed $SIM_MAC"
      return
    fi
    if auth_json GET /api/devices "$token" |
      jq -e --arg mac "$SIM_MAC" '.data[]? | select(.macAddress == $mac)' >/dev/null; then
      log "$SIM_MAC already claimed"
      return
    fi
    sleep 1
  done
  die "simulator never registered $SIM_MAC, see $LOG_DIR/simulator.log"
}

# A live cycle makes the dashboard show real phase data instead of H-0 standby.
start_cycle() {
  local token=$1 device_id
  device_id=$(auth_json GET /api/devices "$token" |
    jq -r --arg mac "$SIM_MAC" '.data[]? | select(.macAddress == $mac) | .id' | head -1)
  [[ -n "$device_id" ]] || return 0
  auth_json POST "/api/device/$device_id/incubation/start" "$token" >/dev/null
  log "incubation cycle running for $device_id"
}

up() {
  load_env
  mkdir -p "$LOG_DIR" "$RUN_DIR" "$DEV_DIR/bin"
  build_api

  start_bg api "$ROOT/apps/api-go" \
    env PORT="$API_PORT" \
    DB_PATH="$DB" \
    WEB_DIST="$ROOT/apps/web/dist" \
    APP_ENV=development \
    CORS_ORIGINS="$WEB_URL,http://localhost:$WEB_PORT" \
    "$BIN"
  wait_for_http "$API_URL/api/health" API

  start_bg simulator "$ROOT/apps/simulator" \
    env API_URL="$API_URL" \
    MAC_ADDRESS="$SIM_MAC" \
    PAIRING_PIN="$SIM_PIN" \
    DEVICE_SECRET="${DEVICE_SECRET:-dev-device-secret}" \
    bun run src/index.ts

  seed_user
  local token
  token=$(login_token)
  claim_device "$token"
  start_cycle "$token"

  start_bg web "$ROOT/apps/web" \
    env VITE_API_TARGET="$API_URL" \
    bunx vite --host "$WEB_HOST" --port "$WEB_PORT" --strictPort
  wait_for_http "$WEB_URL/" "Vite dev server"
  wait_for_http "$WEB_URL/api/health" "Vite /api proxy"

  cat <<EOF

  Web    $WEB_URL
  API    $API_URL  (database: $DB)
  Login  $DEV_EMAIL / $DEV_PASSWORD
  Logs   $LOG_DIR

  Stop with: scripts/dev-local.sh down

EOF
}

down() {
  stop_bg web
  stop_bg simulator
  stop_bg api
}

status() {
  local name
  for name in api simulator web; do
    if is_running "$name"; then
      log "$name: running (pid $(cat "$(pidfile "$name")"))"
    else
      log "$name: stopped"
    fi
  done
  if curl -fsS -o /dev/null --max-time 2 "$API_URL/api/health" 2>/dev/null; then
    log "api health: ok"
  fi
}

logs() {
  tail -n 40 -F "$LOG_DIR"/*.log
}

reset() {
  down
  # Guard the resolved path before removing anything.
  [[ "$DEV_DIR" == "$ROOT/.local-dev" ]] || die "refusing to remove $DEV_DIR"
  rm -rf "$DEV_DIR"
  log "wiped $DEV_DIR"
}

case "${1:-up}" in
up) up ;;
down) down ;;
status) status ;;
logs) logs ;;
reset) reset ;;
*) die "usage: $0 [up|down|status|logs|reset]" ;;
esac
