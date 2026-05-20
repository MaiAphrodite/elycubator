import { Elysia, t } from 'elysia';
import { prisma } from '../db';

export const telemetryRoutes = new Elysia({ prefix: '/api/telemetry' })
  .post('/', async ({ body, set }) => {
    const { macAddress, temperature, humidity, lampDuty, fanDuty, servoAngle } = body;

    const device = await prisma.device.findUnique({
      where: { macAddress }
    });

    if (!device) {
      set.status = 404;
      return { success: false, error: "Device not found." };
    }

    if (!device.isClaimed) {
      set.status = 403;
      return { success: false, error: "Device must be claimed before transmitting telemetry." };
    }

    const telemetry = await prisma.telemetry.create({
      data: {
        deviceId: device.id,
        temperature,
        humidity,
        lampDuty,
        fanDuty,
        servoAngle,
      }
    });

    return { success: true, data: telemetry };
  }, {
    body: t.Object({
      macAddress: t.String(),
      temperature: t.Optional(t.Numeric()),
      humidity: t.Optional(t.Numeric()),
      lampDuty: t.Optional(t.Numeric()),
      fanDuty: t.Optional(t.Numeric()),
      servoAngle: t.Optional(t.Numeric()),
    })
  })

  .get('/history/:deviceId', async ({ params, query, set }) => {
    const device = await prisma.device.findUnique({
      where: { id: params.deviceId }
    });

    if (!device) {
      set.status = 404;
      return { success: false, error: "Device not found." };
    }

    const limit = Number(query.limit) || 50;

    const readings = await prisma.telemetry.findMany({
      where: { deviceId: params.deviceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return { success: true, data: readings.reverse() };
  }, {
    params: t.Object({ deviceId: t.String() }),
    query: t.Object({ limit: t.Optional(t.String()) }),
  });
