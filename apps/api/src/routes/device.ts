import { Elysia, t } from 'elysia';
import { prisma } from '../db';

export const deviceRoutes = new Elysia({ prefix: '/api/device' })
  /**
   * Device Init / Beacon Endpoint
   * Hit by the Wokwi ESP32 simulator once it connects to the internet.
   * Registers the device if unknown, updates offline PIN for claiming.
   */
  .post('/init', async ({ body }) => {
    const { macAddress, pairingPin } = body;

    // Try to find the device
    const existing = await prisma.device.findUnique({
      where: { macAddress }
    });

    if (existing) {
      if (existing.isClaimed) {
        return { success: true, claimed: true, message: "Device is already claimed." };
      } else {
        // Update the pairing PIN just in case it generated a new one
        await prisma.device.update({
          where: { macAddress },
          data: { pairingCode: pairingPin }
        });
        return { success: true, claimed: false, message: "Device PIN updated." };
      }
    }

    // Register a new unclaimed device
    await prisma.device.create({
      data: {
        macAddress,
        pairingCode: pairingPin,
        isClaimed: false
      }
    });

    return { success: true, claimed: false, message: "Device registered and awaiting claim." };
  }, {
    body: t.Object({
      macAddress: t.String(),
      pairingPin: t.String()
    })
  })
  
  /**
   * Device Claim Endpoint
   * Hit by the React Web SPA when a user claims the device.
   */
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

    // Claim the device
    await prisma.device.update({
      where: { macAddress },
      data: {
        isClaimed: true,
        pairingCode: null, // Clear the pin for security
        nickname,
        userId
      }
    });

    // Initialize default settings for this newly claimed incubator
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
      userId: t.String() // In a real app, this comes from the Auth token
    })
  });
