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
