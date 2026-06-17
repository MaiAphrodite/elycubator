import Elysia from "elysia";
import { jwtPlugin } from "../lib/jwt";
import type { UserPayload } from "../lib/jwt";

export class AuthError extends Error {
  constructor(public message: string) {
    super(message);
  }
}

export const requireUser = new Elysia({ name: "requireUser" })
  .use(jwtPlugin)
  .derive({ as: "scoped" }, async ({ jwt, headers }) => {
    const authorization = headers["authorization"];
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) throw new AuthError("Missing authorization token.");

    const payload = await jwt.verify(token);

    if (!payload || payload.type !== "user") {
      throw new AuthError("Invalid or expired user token.");
    }

    return { user: payload as UserPayload };
  });
