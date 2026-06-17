import { Elysia, t } from "elysia";
import { prisma } from "../db";
import { jwtPlugin } from "../lib/jwt";
import type { DevicePayload } from "../lib/jwt";
import { activeDevices } from "../lib/socket-manager";

export const streamRoutes = new Elysia({ prefix: "/api/device" })
  .use(jwtPlugin)
  .ws("/stream", {
    query: t.Object({
      token: t.String(),
    }),
    async open(ws) {
      const { token } = ws.data.query;

      try {
        const payload = await ws.data.jwt.verify(token);
        if (!payload || payload.type !== "device") {
          ws.send(JSON.stringify({ error: "Invalid device token." }));
          ws.close();
          return;
        }

        const device = await prisma.device.findUnique({
          where: { id: (payload as DevicePayload).sub },
        });

        if (!device || device.deviceToken !== token) {
          ws.send(JSON.stringify({ error: "Device token revoked." }));
          ws.close();
          return;
        }

        // Attach device id for future messages
        (ws as any).deviceId = device.id;
        activeDevices.set(device.id, ws);

        console.log(`📡 Device Connected: ${device.nickname} (${device.id})`);

        // Send current settings upon connection
        const settings = await prisma.settings.findUnique({
          where: { deviceId: device.id },
        });
        
        if (settings) {
          ws.send(JSON.stringify({ type: "SETTINGS_UPDATE", payload: settings }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ error: "Authentication failed." }));
        ws.close();
      }
    },
    async message(ws, message: any) {
      const deviceId = (ws as any).deviceId;
      if (!deviceId) return;

      try {
        const { temperature, humidity, lampDuty, fanDuty, servoAngle } = message;

        await prisma.telemetry.create({
          data: {
            deviceId,
            temperature: Number(temperature) || 0,
            humidity: Number(humidity) || 0,
            lampDuty: Number(lampDuty) || 0,
            fanDuty: Number(fanDuty) || 0,
            servoAngle: Number(servoAngle) || 0,
          },
        });
      } catch (e) {
        console.error("Failed to save telemetry via WS:", e);
      }
    },
    close(ws) {
      const deviceId = (ws as any).deviceId;
      if (deviceId) {
        activeDevices.delete(deviceId);
        console.log(`📡 Device Disconnected: ${deviceId}`);
      }
    },
  });
