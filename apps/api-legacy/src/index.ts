import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { deviceRoutes } from "./routes/device";
import { authRoutes } from "./routes/auth";
import { streamRoutes } from "./routes/stream";
import { telemetryRoutes } from "./routes/telemetry";
import { incubationRoutes } from "./routes/incubation";
import { apiPhpRoutes } from "./routes/api-php";
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
  .use(telemetryRoutes)
  .use(incubationRoutes)
  .use(apiPhpRoutes)
  .get("/", () => "Hello from Elysia IoT Server")
  .listen(Number(process.env.PORT) || 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

