import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { deviceRoutes } from "./routes/device";
import { authRoutes } from "./routes/auth";
import { streamRoutes } from "./routes/stream";
import { env } from "./lib/env";
import { AuthError } from "./middleware/requireUser";

void env;

const app = new Elysia()
  .use(cors())
  .error({ AuthError })
  .onError(({ code, error, set }) => {
    if (code === "AuthError") {
      set.status = 401;
      return { success: false, error: error.message };
    }
  })
  .use(authRoutes)
  .use(deviceRoutes)
  .use(streamRoutes)
  .get("/", () => "Hello from Elysia IoT Server")
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

