import { useCallback, useSyncExternalStore } from "react";
import type { TelemetryReading } from "../types/telemetry";
import { apiFetch, getAccessToken, refreshSession } from "../lib/api";

const MAX_HISTORY = 50;
const API_BASE = import.meta.env.VITE_API_URL ?? "";
const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

interface LiveMessage {
  type?: string;
  deviceId?: string;
  data?: {
    temperature: number;
    humidity: number;
    lampDuty: number;
    fanDuty: number;
    servoAngle: number;
  };
}

interface TelemetryState {
  current: TelemetryReading;
  history: readonly TelemetryReading[];
  deviceId: string | null;
  lampEnabled: boolean;
  fanEnabled: boolean;
}

const EMPTY: TelemetryState = {
  current: {
    time: "--:--:--",
    temperature: 0,
    humidity: 0,
    lampDuty: 0,
    fanDuty: 0,
    servoAngle: 0,
  },
  history: [],
  deviceId: null,
  lampEnabled: true,
  fanEnabled: true,
};

let state: TelemetryState = EMPTY;
let listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let subscribers = 0;
let seededDevice: string | null = null;
let seededSettings: string | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000;
let intentionalClose = false;

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<TelemetryState>) {
  state = { ...state, ...patch };
  emit();
}

function seedSettings(deviceId: string) {
  if (seededSettings === deviceId) return;
  seededSettings = deviceId;
  apiFetch(`/api/device/${deviceId}/settings`)
    .then((r) => r.json())
    .then((json) => {
      if (!json?.success || !json.data) return;
      const s = json.data;
      setState({
        lampEnabled: Boolean(s.LampEnabled ?? s.lampEnabled ?? false),
        fanEnabled: Boolean(s.FanEnabled ?? s.fanEnabled ?? false),
      });
    })
    .catch(() => {});
}

function seedHistory(deviceId: string) {
  if (seededDevice === deviceId) return;
  seededDevice = deviceId;
  apiFetch(`/api/telemetry/history/${deviceId}?limit=${MAX_HISTORY}`)
    .then((r) => r.json())
    .then((json) => {
      if (!json?.success || !Array.isArray(json.data)) return;
      const seeded: TelemetryReading[] = json.data.map((row: any) => ({
        time: new Date(row.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        temperature: row.temperature ?? 0,
        humidity: row.humidity ?? 0,
        lampDuty: row.lampDuty ?? 0,
        fanDuty: row.fanDuty ?? 0,
        servoAngle: row.servoAngle ?? 0,
      }));
      const patch: Partial<TelemetryState> = { history: seeded };
      if (seeded.length > 0) patch.current = seeded[seeded.length - 1];
      setState(patch);
    })
    .catch(() => {});
}

function connect() {
  if (socket) return;
  const token = getAccessToken();
  if (!token) return;

  intentionalClose = false;
  const ws = new WebSocket(`${WS_BASE}/api/device/live?token=${encodeURIComponent(token)}`);
  socket = ws;

  ws.onopen = () => {
    reconnectDelay = 2000;
  };

  ws.onmessage = (event) => {
    let msg: LiveMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type !== "TELEMETRY" || !msg.data) return;

    const patch: Partial<TelemetryState> = {};
    if (msg.deviceId) {
      patch.deviceId = msg.deviceId;
      seedHistory(msg.deviceId);
      seedSettings(msg.deviceId);
    }

    const reading: TelemetryReading = {
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      ...msg.data,
    };
    patch.current = reading;
    const next = [...state.history, reading];
    patch.history = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    setState(patch);
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (!intentionalClose) scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer || subscribers === 0) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (subscribers === 0) return;
    await refreshSession();
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
}

function disconnect() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

function scheduleDisconnect() {
  if (disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    if (subscribers === 0) disconnect();
  }, 500);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  if (subscribers === 0) connect();
  subscribers += 1;
  return () => {
    listeners.delete(listener);
    subscribers -= 1;
    if (subscribers === 0) scheduleDisconnect();
  };
}

function getSnapshot(): TelemetryState {
  return state;
}

function getServerSnapshot(): TelemetryState {
  return EMPTY;
}

export function useTelemetryStream() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLampEnabled = useCallback(
    (enabled: boolean) => {
      setState({ lampEnabled: enabled });
      if (snap.deviceId) {
        apiFetch(`/api/device/${snap.deviceId}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lampEnabled: enabled }),
        }).catch(() => {});
      }
    },
    [snap.deviceId]
  );

  const setFanEnabled = useCallback(
    (enabled: boolean) => {
      setState({ fanEnabled: enabled });
      if (snap.deviceId) {
        apiFetch(`/api/device/${snap.deviceId}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fanEnabled: enabled }),
        }).catch(() => {});
      }
    },
    [snap.deviceId]
  );

  const triggerServo = useCallback(() => {
    if (snap.deviceId) {
      apiFetch(`/api/device/${snap.deviceId}/servo/trigger`, {
        method: "POST",
      }).catch(() => {});
    }
  }, [snap.deviceId]);

  const exportAsCsv = useCallback(() => {
    const history = state.history;
    if (history.length === 0) return;

    const header = "Time,Temperature,Humidity,Lamp Duty,Fan Duty,Servo Angle";
    const rows = history.map(
      (r) =>
        `${r.time},${r.temperature.toFixed(2)},${r.humidity.toFixed(2)},${r.lampDuty.toFixed(1)},${r.fanDuty.toFixed(1)},${r.servoAngle}`
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incubator_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  return {
    current: snap.current,
    history: snap.history,
    deviceId: snap.deviceId,
    lampEnabled: snap.lampEnabled,
    fanEnabled: snap.fanEnabled,
    setLampEnabled,
    setFanEnabled,
    triggerServo,
    exportAsCsv,
  } as const;
}
