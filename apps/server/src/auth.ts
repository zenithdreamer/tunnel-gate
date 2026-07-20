import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "./db";

export async function userCount(): Promise<number> {
  return prisma.user.count();
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me",
  emailAndPassword: { enabled: true },
  trustedOrigins: [baseURL, "http://localhost:5173", "http://localhost:3000"],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up") && (await userCount()) > 0 && process.env.ALLOW_SIGNUP !== "true") {
        throw new APIError("FORBIDDEN", {
          message: "Sign-up is disabled. Ask the admin for an account.",
        });
      }
    }),
  },
});

export async function getSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
