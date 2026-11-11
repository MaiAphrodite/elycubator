import Elysia from "elysia";
import { jwtPlugin } from "../lib/jwt";
import { prisma } from "../db";
import type { DevicePayload } from "../lib/jwt";
import { AuthError } from "./requireUser";

export const requireDevice = new Elysia({ name: "requireDevice" })
  .use(jwtPlugin)
  .derive({ as: "scoped" }, async ({ jwt, headers }) => {
    const authorization = headers["authorization"];
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) throw new AuthError("Missing device authorization token.");

    const payload = await jwt.verify(token);

    if (!payload || payload.type !== "device") {
      throw new AuthError("Invalid or expired device token.");
    }

    const device = await prisma.device.findUnique({
      where: { id: (payload as DevicePayload).sub },
    });

    if (!device || device.deviceToken !== token) {
      throw new AuthError("Device token has been revoked or is unrecognized.");
    }

    return { device };
  });
