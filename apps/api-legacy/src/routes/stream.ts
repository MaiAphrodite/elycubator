import { Elysia, t } from "elysia";
import { prisma } from "../db";
import { jwtPlugin } from "../lib/jwt";
import type { DevicePayload } from "../lib/jwt";
import { activeDevices, addWebClient, removeWebClient, broadcastTelemetry } from "../lib/socket-manager";
import { liveDayCount, activeProfile, fanState } from "../lib/incubation";

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
        (ws.data as any).deviceId = device.id;
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
      const deviceId = (ws.data as any).deviceId;
      if (!deviceId) return;

      try {
        const m = message as Record<string, any>;
        const temperature = m.temperature ?? m.suhu;
        const humidity = m.humidity ?? m.hum;
        const lampDuty = m.lampDuty ?? m.dimmer;
        const fanDuty = m.fanDuty ?? m.kipas;
        const servoAngle = m.servoAngle ?? m.servo_angle ?? 0;

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

        broadcastTelemetry(deviceId, {
          temperature: Number(temperature) || 0,
          humidity: Number(humidity) || 0,
          lampDuty: Number(lampDuty) || 0,
          fanDuty: Number(fanDuty) || 0,
          servoAngle: Number(servoAngle) || 0,
        });

        const m2 = message as Record<string, any>;
        const profileData: Record<string, number | boolean> = {};
        if (m2.target_suhu_set !== undefined) profileData.targetTempSet = Number(m2.target_suhu_set);
        if (m2.target_suhu_hatch !== undefined) profileData.targetTempHatch = Number(m2.target_suhu_hatch);
        if (m2.kp_set !== undefined) profileData.setKp = Number(m2.kp_set);
        if (m2.ki_set !== undefined) profileData.setKi = Number(m2.ki_set);
        if (m2.kd_set !== undefined) profileData.setKd = Number(m2.kd_set);
        if (m2.kp_hatch !== undefined) profileData.hatchKp = Number(m2.kp_hatch);
        if (m2.ki_hatch !== undefined) profileData.hatchKi = Number(m2.ki_hatch);
        if (m2.kd_hatch !== undefined) profileData.hatchKd = Number(m2.kd_hatch);
        if (m2.mode_auto !== undefined) profileData.modeAuto = !!m2.mode_auto;

        let settings = await prisma.settings.findUnique({ where: { deviceId } });
        if (!settings) {
          settings = await prisma.settings.create({ data: { deviceId } }).catch(() => null);
        }
        if (settings && Object.keys(profileData).length > 0) {
          settings = await prisma.settings.update({ where: { deviceId }, data: profileData });
        }

        if (settings) {
          const day = liveDayCount(settings);
          const profile = activeProfile(settings, day);
          const kipas = fanState(
            Number(humidity) || 0,
            Number(temperature) || 0,
            profile.targetTemp,
            settings.kipas
          );

          await prisma.settings.update({
            where: { deviceId },
            data: {
              dayCount: day,
              targetTemp: profile.targetTemp,
              tempKp: profile.kp,
              tempKi: profile.ki,
              tempKd: profile.kd,
              kipas,
              turnerTest: false,
            },
          });

          ws.send(
            JSON.stringify({
              type: "CONTROL",
              payload: {
                kipas,
                target_suhu: profile.targetTemp,
                mode_auto: settings.modeAuto ? 1 : 0,
                hari_ke: day,
                turner_test: settings.turnerTest ? 1 : 0,
                kp: profile.kp,
                ki: profile.ki,
                kd: profile.kd,
              },
            })
          );
        }
      } catch (e) {
        console.error("Failed to save telemetry via WS:", e);
      }
    },
    close(ws) {
      const deviceId = (ws.data as any).deviceId;
      if (deviceId) {
        activeDevices.delete(deviceId);
        console.log(`📡 Device Disconnected: ${deviceId}`);
      }
    },
  })
  .ws("/live", {
    query: t.Object({
      token: t.String(),
      deviceId: t.Optional(t.String()),
    }),
    async open(ws) {
      const { token, deviceId } = ws.data.query;
      try {
        const payload = await ws.data.jwt.verify(token);
        if (!payload || payload.type !== "user") {
          ws.send(JSON.stringify({ error: "Invalid user token." }));
          ws.close();
          return;
        }
        const key = deviceId ?? "*";
        (ws.data as any).liveKey = key;
        addWebClient(key, ws);
        console.log(`👁 Web client subscribed: ${key}`);
      } catch {
        ws.send(JSON.stringify({ error: "Authentication failed." }));
        ws.close();
      }
    },
    close(ws) {
      const key = (ws.data as any).liveKey;
      if (key) removeWebClient(key, ws);
    },
  });
