import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { api } from "./api";
import { auth, userCount } from "./auth";

export function createApp() {
  return new Elysia()
    .use(
      cors({
        origin: ["http://localhost:5173", "http://localhost:3000"],
        credentials: true,
      }),
    )
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    .get("/api/setup", async () => ({ needsSetup: (await userCount()) === 0 }))
    .use(api);
}

export type App = ReturnType<typeof createApp>;
