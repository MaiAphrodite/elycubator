import Elysia, { t } from "elysia";
import { prisma } from "../db";
import { jwtPlugin, signDeviceToken } from "../lib/jwt";
import { verifyHmac } from "../lib/crypto";
import { requireUser } from "../middleware/requireUser";
import { requireDevice } from "../middleware/requireDevice";
import { env } from "../lib/env";
import { pushDeviceSettings } from "../lib/socket-manager";

export const deviceRoutes = new Elysia({ prefix: "/api/device" })
  .use(jwtPlugin)

  .post(
    "/init",
    async ({ body, jwt, set }) => {
      const { macAddress, pairingPin, hmacSignature } = body;

      const device = await prisma.device.findUnique({ where: { macAddress } });
      const secret = device?.deviceSecret ?? env.deviceSecret;

      const expectedData = `${macAddress}:${pairingPin}`;
      if (!verifyHmac(expectedData, secret, hmacSignature)) {
        set.status = 401;
        return { success: false, error: "HMAC signature verification failed." };
      }

      if (device?.isClaimed) {
        const devicePayload = signDeviceToken(
          { sub: device.id, macAddress },
          env.deviceTokenExpiresIn
        );
        const deviceToken = await jwt.sign(devicePayload);
        await prisma.device.update({
          where: { id: device.id },
          data: { deviceToken },
        });
        return {
          success: true,
          deviceId: device.id,
          claimed: true,
          deviceToken,
          message: "Device already claimed. New session token issued.",
        };
      }

      const upserted = await prisma.device.upsert({
        where: { macAddress },
        update: { pairingCode: pairingPin },
        create: {
          macAddress,
          pairingCode: pairingPin,
          isClaimed: false,
          deviceSecret: env.deviceSecret,
        },
      });

      const devicePayload = signDeviceToken(
        { sub: upserted.id, macAddress },
        env.deviceTokenExpiresIn
      );
      const deviceToken = await jwt.sign(devicePayload);

      await prisma.device.update({
        where: { id: upserted.id },
        data: { deviceToken },
      });

      return {
        success: true,
        deviceId: upserted.id,
        claimed: false,
        deviceToken,
        message: "Device registered and awaiting claim.",
      };
    },
    {
      body: t.Object({
        macAddress: t.String(),
        pairingPin: t.String(),
        hmacSignature: t.String(),
      }),
    }
  )

  .use(requireUser)
  .post(
    "/claim",
    async ({ body, user, set }) => {
      const { macAddress, pairingPin, nickname } = body;

      const device = await prisma.device.findUnique({ where: { macAddress } });

      if (!device) {
        set.status = 404;
        return {
          success: false,
          error: "Device not found. Ensure it is connected to the internet first.",
        };
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
        data: { isClaimed: true, pairingCode: null, nickname, userId: user.id },
      });

      const settingsExist = await prisma.settings.findUnique({
        where: { deviceId: device.id },
      });

      if (!settingsExist) {
        await prisma.settings.create({
          data: { deviceId: device.id, targetTemp: 37.5, targetHumidity: 55.0 },
        });
      }

      return { success: true, message: "Device successfully claimed!" };
    },
    {
      body: t.Object({
        macAddress: t.String(),
        pairingPin: t.String(),
        nickname: t.String(),
      }),
    }
  )

  .get(
    "/:deviceId/settings",
    async ({ params, set }) => {
      const settings = await prisma.settings.findUnique({
        where: { deviceId: params.deviceId },
      });

      if (!settings) {
        set.status = 404;
        return { success: false, error: "Settings not found for this device." };
      }

      return { success: true, data: settings };
    },
    { params: t.Object({ deviceId: t.String() }) }
  )

  .put(
    "/:deviceId/settings",
    async ({ params, body, set }) => {
      const existing = await prisma.settings.findUnique({
        where: { deviceId: params.deviceId },
      });

      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found for this device." };
      }

      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: body,
      });

      pushDeviceSettings(params.deviceId, settings);

      return { success: true, data: settings };
    },
    {
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
      }),
    }
  )

  .post(
    "/:deviceId/servo/trigger",
    async ({ params, set }) => {
      const existing = await prisma.settings.findUnique({
        where: { deviceId: params.deviceId },
      });

      if (!existing) {
        set.status = 404;
        return { success: false, error: "Settings not found." };
      }

      const settings = await prisma.settings.update({
        where: { deviceId: params.deviceId },
        data: { servoTrigger: true },
      });

      pushDeviceSettings(params.deviceId, settings);

      return { success: true, message: "Servo turn triggered." };
    },
    { params: t.Object({ deviceId: t.String() }) }
  );
