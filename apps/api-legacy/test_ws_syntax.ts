import { Elysia } from "elysia";
const app = new Elysia().ws("/test", {
  message(ws, msg) { ws.send("hello"); }
});
console.log(typeof app.ws);
