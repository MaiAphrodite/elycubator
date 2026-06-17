import Elysia, { t } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { prisma } from "../db";
import { jwtPlugin, signUserToken } from "../lib/jwt";
import { hashPassword, verifyPassword, generateSecret } from "../lib/crypto";
import { env } from "../lib/env";

const REFRESH_COOKIE = "refresh_token";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(jwtPlugin)
  .use(cookie())

  .post(
    "/register",
    async ({ body, set }) => {
      const { email, password, name } = body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        set.status = 409;
        return { success: false, error: "Email is already registered." };
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, name, passwordHash },
      });

      return {
        success: true,
        message: "Account created successfully.",
        data: { id: user.id, email: user.email, name: user.name },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
        name: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/login",
    async ({ body, jwt, set, cookie: cookies }) => {
      const { email, password } = body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        set.status = 401;
        return { success: false, error: "Invalid credentials." };
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { success: false, error: "Invalid credentials." };
      }

      const accessPayload = signUserToken(
        { sub: user.id, email: user.email },
        env.jwtExpiresIn
      );
      const accessToken = await jwt.sign(accessPayload);

      const rawRefresh = generateSecret();
      const refreshHash = await hashPassword(rawRefresh);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: refreshHash },
      });

      cookies[REFRESH_COOKIE].set({
        value: rawRefresh,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/api/auth",
      });

      return {
        success: true,
        data: {
          accessToken,
          user: { id: user.id, email: user.email, name: user.name },
        },
      };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )

  .post("/refresh", async ({ jwt, set, cookie: cookies }) => {
    const rawRefresh = cookies[REFRESH_COOKIE]?.value;

    if (!rawRefresh) {
      set.status = 401;
      return { success: false, error: "No refresh token provided." };
    }

    const user = await prisma.user.findFirst({
      where: { refreshToken: { not: null } },
    });

    if (!user || !user.refreshToken) {
      set.status = 401;
      return { success: false, error: "Session not found." };
    }

    const valid = await verifyPassword(rawRefresh, user.refreshToken);
    if (!valid) {
      set.status = 401;
      return { success: false, error: "Invalid refresh token." };
    }

    const accessPayload = signUserToken(
      { sub: user.id, email: user.email },
      env.jwtExpiresIn
    );
    const accessToken = await jwt.sign(accessPayload);

    return { success: true, data: { accessToken } };
  })

  .post("/logout", async ({ set, cookie: cookies }) => {
    const rawRefresh = cookies[REFRESH_COOKIE]?.value;

    if (rawRefresh) {
      const user = await prisma.user.findFirst({
        where: { refreshToken: { not: null } },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: null },
        });
      }
    }

    cookies[REFRESH_COOKIE].remove();
    return { success: true, message: "Logged out." };
  })

  .get("/me", async ({ jwt, headers, set }) => {
    const authorization = headers["authorization"];
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) {
      set.status = 401;
      return { success: false, error: "Missing authorization token." };
    }

    const payload = await jwt.verify(token);
    if (!payload || payload.type !== "user") {
      set.status = 401;
      return { success: false, error: "Invalid or expired token." };
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
      include: {
        devices: {
          select: {
            id: true,
            macAddress: true,
            nickname: true,
            isClaimed: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      set.status = 404;
      return { success: false, error: "User not found." };
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        devices: user.devices,
      },
    };
  });
