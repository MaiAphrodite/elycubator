import { Elysia, t } from 'elysia';
import { prisma } from '../db';

export const deviceRoutes = new Elysia({ prefix: '/api/device' })
  .post('/init', async ({ body }) => {
    const { macAddress, pairingPin } = body;

    const existing = await prisma.device.findUnique({
      where: { macAddress }
    });

    if (existing) {
      if (existing.isClaimed) {
        return { success: true, deviceId: existing.id, claimed: true, message: "Device is already claimed." };
      }
      await prisma.device.update({
        where: { macAddress },
        data: { pairingCode: pairingPin }
      });
      return { success: true, deviceId: existing.id, claimed: false, message: "Device PIN updated." };
    }

    const device = await prisma.device.create({
      data: {
        macAddress,
        pairingCode: pairingPin,
        isClaimed: false
      }
    });

    return { success: true, deviceId: device.id, claimed: false, message: "Device registered and awaiting claim." };
  }, {
    body: t.Object({
      macAddress: t.String(),
      pairingPin: t.String()
    })
  })

  .post('/claim', async ({ body, set }) => {
    const { macAddress, pairingPin, nickname, userId } = body;

    const device = await prisma.device.findUnique({
      where: { macAddress }
    });

    if (!device) {
      set.status = 404;
      return { success: false, error: "Device not found. Ensure it is connected to the internet first." };
    }

    if (device.isClaimed) {
      set.status = 400;
      return { success: false, error: "Device is already claimed." };
    }

    if (device.pairingCode !== pairingPin) {
      set.status = 401;
      return { success: false, error: "Invalid Pairing PIN." };
    }

    await prisma.device.update({
      where: { macAddress },
      data: {
        isClaimed: true,
        pairingCode: null,
        nickname,
        userId
      }
    });

    await prisma.settings.create({
      data: {
        deviceId: device.id,
        targetTemp: 37.5,
        targetHumidity: 55.0
      }
    });

    return { success: true, message: "Device successfully claimed!" };
  }, {
    body: t.Object({
      macAddress: t.String(),
      pairingPin: t.String(),
      nickname: t.String(),
      userId: t.String()
    })
  })

  .get('/:deviceId/settings', async ({ params, set }) => {
    const settings = await prisma.settings.findUnique({
      where: { deviceId: params.deviceId }
    });

    if (!settings) {
      set.status = 404;
      return { success: false, error: "Settings not found for this device." };
    }

    return { success: true, data: settings };
  }, {
    params: t.Object({ deviceId: t.String() })
  })

  .put('/:deviceId/settings', async ({ params, body, set }) => {
    const existing = await prisma.settings.findUnique({
      where: { deviceId: params.deviceId }
    });

    if (!existing) {
      set.status = 404;
      return { success: false, error: "Settings not found for this device." };
    }

    const settings = await prisma.settings.update({
      where: { deviceId: params.deviceId },
      data: body,
    });

    return { success: true, data: settings };
  }, {
    params: t.Object({ deviceId: t.String() }),
    body: t.Object({
      targetTemp: t.Optional(t.Numeric()),
      targetHumidity: t.Optional(t.Numeric()),
      tempKp: t.Optional(t.Numeric()),
      tempKi: t.Optional(t.Numeric()),
      tempKd: t.Optional(t.Numeric()),
      humidKp: t.Optional(t.Numeric()),
      humidKi: t.Optional(t.Numeric()),
      humidKd: t.Optional(t.Numeric()),
      turnIntervalHrs: t.Optional(t.Numeric()),
      turnAngle: t.Optional(t.Numeric()),
      servoTrigger: t.Optional(t.Boolean()),
      lampEnabled: t.Optional(t.Boolean()),
      fanEnabled: t.Optional(t.Boolean()),
    })
  })

  .post('/:deviceId/servo/trigger', async ({ params, set }) => {
    const existing = await prisma.settings.findUnique({
      where: { deviceId: params.deviceId }
    });

    if (!existing) {
      set.status = 404;
      return { success: false, error: "Settings not found." };
    }

    await prisma.settings.update({
      where: { deviceId: params.deviceId },
      data: { servoTrigger: true }
    });

    return { success: true, message: "Servo turn triggered." };
  }, {
    params: t.Object({ deviceId: t.String() })
  });
