const webClients = new Map<string, Set<any>>();

export function addWebClient(key: string, socket: any) {
  let set = webClients.get(key);
  if (!set) webClients.set(key, (set = new Set()));
  set.add(socket);
}

export function removeWebClient(key: string, socket: any) {
  webClients.get(key)?.delete(socket);
}

export function broadcastTelemetry(deviceId: string, reading: Record<string, number>) {
  const frame = JSON.stringify({ type: "TELEMETRY", deviceId, data: reading });
  for (const key of [deviceId, "*"]) {
    for (const s of webClients.get(key) ?? []) {
      try { s.send(frame); } catch {}
    }
  }
}

export const activeDevices = new Map<string, any>();

/**
 * Pushes new settings to a connected device instantly.
 * Returns true if the device was online and received the update.
 */
export function pushDeviceSettings(deviceId: string, settings: any): boolean {
  const socket = activeDevices.get(deviceId);
  if (socket) {
    socket.send(JSON.stringify({ type: "SETTINGS_UPDATE", payload: settings }));
    return true;
  }
  return false;
}
