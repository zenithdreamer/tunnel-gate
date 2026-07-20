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
    .use(api)
    .onError(({ code, error, set }) => {
      if (code === "VALIDATION") {
        set.status = 422;
        return { error: error.message };
      }
      if (code === "PARSE") {
        set.status = 400;
        return { error: "malformed request body" };
      }
      if (code === "NOT_FOUND") return undefined;
      set.status = 500;
      return { error: error instanceof Error ? error.message : "internal server error" };
    });
}

export type App = ReturnType<typeof createApp>;
