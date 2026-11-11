import Elysia, { t } from "elysia";
import { prisma } from "../db";
import { requireUser } from "../middleware/requireUser";
import { pushDeviceSettings } from "../lib/socket-manager";
import { liveDayCount, activeProfile, incubationView } from "../lib/incubation";

async function getSettings(deviceId: string) {
  return prisma.settings.findUnique({ where: { deviceId } });
}

export const incubationRoutes = new Elysia({ prefix: "/api/device" })
  .use(requireUser)
  .get(
    "/:deviceId/incubation",
    async ({ params, set }) => {
      const settings = await getSettings(params.deviceId);
      if (!settings) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }
      return { success: true, data: incubationView(settings) };
    },
    { params: t.Object({ deviceId: t.String() }) }
  )
  .post(
    "/:deviceId/incubation/start",
    async ({ params, set }) => {
      const existing = await getSettings(params.deviceId);
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }
      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: { dayCount: 1, startedAt: new Date() },
      });
      pushDeviceSettings(params.deviceId, settings);
      return { success: true, data: incubationView(settings) };
    },
    { params: t.Object({ deviceId: t.String() }) }
  )
  .post(
    "/:deviceId/incubation/stop",
    async ({ params, set }) => {
      const existing = await getSettings(params.deviceId);
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }
      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: { dayCount: 0, startedAt: null, kipas: 0 },
      });
      pushDeviceSettings(params.deviceId, settings);
      return { success: true, data: incubationView(settings) };
    },
    { params: t.Object({ deviceId: t.String() }) }
  )
  .post(
    "/:deviceId/incubation/mode",
    async ({ params, body, set }) => {
      const existing = await getSettings(params.deviceId);
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }
      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: { modeAuto: body.val },
      });
      pushDeviceSettings(params.deviceId, settings);
      return { success: true, data: incubationView(settings) };
    },
    { params: t.Object({ deviceId: t.String() }), body: t.Object({ val: t.Boolean() }) }
  )
  .post(
    "/:deviceId/incubation/test-turner",
    async ({ params, set }) => {
      const existing = await getSettings(params.deviceId);
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }
      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: { turnerTest: true },
      });
      pushDeviceSettings(params.deviceId, settings);
      return { success: true, data: incubationView(settings) };
    },
    { params: t.Object({ deviceId: t.String() }) }
  )
  .put(
    "/:deviceId/incubation/profiles",
    async ({ params, body, set }) => {
      const existing = await getSettings(params.deviceId);
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }

      const data: Record<string, number> = {};
      if (body.tss !== undefined) data.targetTempSet = body.tss;
      if (body.tsh !== undefined) data.targetTempHatch = body.tsh;
      if (body.kps !== undefined) data.setKp = body.kps;
      if (body.kis !== undefined) data.setKi = body.kis;
      if (body.kds !== undefined) data.setKd = body.kds;
      if (body.kph !== undefined) data.hatchKp = body.kph;
      if (body.kih !== undefined) data.hatchKi = body.kih;
      if (body.kdh !== undefined) data.hatchKd = body.kdh;

      let settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data,
      });

      const day = liveDayCount(settings);
      if (day > 0) {
        const profile = activeProfile(settings, day);
        settings = await prisma.settings.update({
          where: { deviceId: params.deviceId },
          data: {
            targetTemp: profile.targetTemp,
            tempKp: profile.kp,
            tempKi: profile.ki,
            tempKd: profile.kd,
          },
        });
      }

      pushDeviceSettings(params.deviceId, settings);
      return { success: true, data: incubationView(settings) };
    },
    {
      params: t.Object({ deviceId: t.String() }),
      body: t.Object({
        tss: t.Optional(t.Numeric()),
        tsh: t.Optional(t.Numeric()),
        kps: t.Optional(t.Numeric()),
        kis: t.Optional(t.Numeric()),
        kds: t.Optional(t.Numeric()),
        kph: t.Optional(t.Numeric()),
        kih: t.Optional(t.Numeric()),
        kdh: t.Optional(t.Numeric()),
      }),
    }
  );
