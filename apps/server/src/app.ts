import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { api } from "./api";
import { auth, userCount } from "./auth";

export function createApp() {
  return new Elysia()
    .onError({ as: "global" }, ({ code, error, set }) => {
      if (code === "VALIDATION") {
        set.status = 422;
        const seen = new Set<string>();
        const summary = error.all
          .filter((issue) => issue.summary && !seen.has(issue.path) && seen.add(issue.path))
          .map((issue) => issue.summary);
        return {
          error: summary.length ? summary.join(", ") : "invalid request",
        };
      }
      if (code === "PARSE") {
        set.status = 400;
        return { error: "malformed request body" };
      }
      if (code === "NOT_FOUND") return undefined;
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "internal server error",
      };
    })
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
