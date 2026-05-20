import { Elysia } from "elysia";
import { deviceRoutes } from "./routes/device";
import { telemetryRoutes } from "./routes/telemetry";

const app = new Elysia()
  .use(deviceRoutes)
  .use(telemetryRoutes)
  .get("/", () => "Hello from Elysia IoT Server")
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
