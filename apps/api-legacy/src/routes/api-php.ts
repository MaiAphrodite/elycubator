import Elysia, { t } from "elysia";
import { prisma } from "../db";
import { liveDayCount, activeProfile, fanState, incubationView } from "../lib/incubation";

const NUM = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function resolveSettings(deviceId?: string) {
  deviceId = deviceId ?? process.env.INCUBATOR_DEVICE_ID;
  const device = deviceId
    ? await prisma.device.findUnique({ where: { id: deviceId } })
    : await prisma.device.findFirst({ orderBy: { createdAt: "asc" } });

  if (!device) return null;

  return prisma.settings.upsert({
    where: { deviceId: device.id },
    update: {},
    create: { deviceId: device.id },
  });
}

export const apiPhpRoutes = new Elysia().get(
  "/api.php",
  async ({ query, set }) => {
    const settings = await resolveSettings(query.deviceId);
    if (!settings) {
      set.status = 404;
      return { status: "error", error: "No device registered." };
    }

    const action = query.action ?? "read";

    if (action === "update_esp") {
      const suhu = NUM(query.suhu, settings.targetTemp);
      const hum = NUM(query.hum, settings.targetHumidity);
      const dimmer = NUM(query.dimmer, 0);

      const day = liveDayCount(settings);
      const profile = activeProfile(settings, day);
      const kipas = fanState(hum, suhu, profile.targetTemp, settings.kipas);

      await prisma.telemetry.create({
        data: {
          deviceId: settings.deviceId,
          temperature: suhu,
          humidity: hum,
          lampDuty: dimmer,
          fanDuty: kipas * 100,
          servoAngle: 0,
        },
      });

      const consumed = settings.turnerTest;

      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
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

      return {
        kipas,
        target_suhu: profile.targetTemp,
        mode_auto: settings.modeAuto ? 1 : 0,
        hari_ke: day,
        turner_test: consumed ? 1 : 0,
        kp: profile.kp,
        ki: profile.ki,
        kd: profile.kd,
      };
    }

    if (action === "set_mode") {
      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
        data: { modeAuto: NUM(query.val, 1) !== 0 },
      });
    } else if (action === "start") {
      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
        data: { dayCount: 1, startedAt: new Date() },
      });
    } else if (action === "stop") {
      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
        data: { dayCount: 0, startedAt: null, kipas: 0 },
      });
    } else if (action === "test_turner") {
      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
        data: { turnerTest: true },
      });
    } else if (action === "set_pid_profil") {
      const data: Record<string, number> = {};
      const map: Record<string, string> = {
        tss: "targetTempSet",
        tsh: "targetTempHatch",
        kps: "setKp",
        kis: "setKi",
        kds: "setKd",
        kph: "hatchKp",
        kih: "hatchKi",
        kdh: "hatchKd",
      };
      for (const [q, field] of Object.entries(map)) {
        if (query[q] !== undefined) data[field] = NUM(query[q], (settings as any)[field]);
      }
      await prisma.settings.update({
        where: { deviceId: settings.deviceId },
        data,
      });
    }

    const fresh = await prisma.settings.findUnique({ where: { deviceId: settings.deviceId } });
    return { status: "success", data: incubationView(fresh!) };
  },
  {
    query: t.Object({
      action: t.Optional(t.String()),
      deviceId: t.Optional(t.String()),
      suhu: t.Optional(t.String()),
      hum: t.Optional(t.String()),
      dimmer: t.Optional(t.String()),
      val: t.Optional(t.String()),
      tss: t.Optional(t.String()),
      tsh: t.Optional(t.String()),
      kps: t.Optional(t.String()),
      kis: t.Optional(t.String()),
      kds: t.Optional(t.String()),
      kph: t.Optional(t.String()),
      kih: t.Optional(t.String()),
      kdh: t.Optional(t.String()),
    }),
  }
);
