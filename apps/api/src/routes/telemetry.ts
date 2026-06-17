import Elysia, { t } from "elysia";
import { prisma } from "../db";
import { requireUser } from "../middleware/requireUser";

export const telemetryRoutes = new Elysia({ prefix: "/api/telemetry" })
  .use(requireUser)
  .get(
    "/history/:deviceId",
    async ({ params, query, set }) => {
      const device = await prisma.device.findUnique({
        where: { id: params.deviceId },
      });

      if (!device) {
        set.status = 404;
        return { success: false, error: "Device not found." };
      }

      const limit = Number(query.limit) || 50;

      const readings = await prisma.telemetry.findMany({
        where: { deviceId: params.deviceId },
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      return { success: true, data: readings.reverse() };
    },
    {
      params: t.Object({ deviceId: t.String() }),
      query: t.Object({ limit: t.Optional(t.String()) }),
    }
  );
