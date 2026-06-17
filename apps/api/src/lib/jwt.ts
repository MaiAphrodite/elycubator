import Elysia from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../lib/env";

export type UserPayload = { sub: string; email: string; type: "user" };
export type DevicePayload = { sub: string; macAddress: string; type: "device" };
export type JwtPayload = UserPayload | DevicePayload;

export const jwtPlugin = new Elysia({ name: "jwt" }).use(
  jwt({ name: "jwt", secret: env.jwtSecret })
);

const expiresInSeconds = (duration: string): number => {
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  return parseInt(match[1]) * units[match[2]];
};

export const signUserToken = (payload: Omit<UserPayload, "type">, expiresIn: string) => ({
  ...payload,
  type: "user" as const,
  exp: Math.floor(Date.now() / 1000) + expiresInSeconds(expiresIn),
});

export const signDeviceToken = (payload: Omit<DevicePayload, "type">, expiresIn: string) => ({
  ...payload,
  type: "device" as const,
  exp: Math.floor(Date.now() / 1000) + expiresInSeconds(expiresIn),
});
