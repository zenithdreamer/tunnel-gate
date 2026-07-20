import { Elysia, status, t } from "elysia";
import { prisma } from "../db";
import { errorMessage } from "../lib/errors";
import { tunnel } from "../vpn/manager";

export const tunnelsApi = new Elysia()
  .get("/tunnel/status", () => tunnel.status())
  .post(
    "/tunnel/connect",
    async ({ body }) => {
      const profile = await prisma.vpnProfile.findUnique({ where: { id: body.profileId } });
      if (!profile) return status(404, { error: "profile not found" });
      if (profile.autoConnect)
        return status(409, { error: "Auto mode manages this profile. Turn auto mode off to connect manually" });

      tunnel.connect(profile).catch(() => {});
      return tunnel.status();
    },
    { body: t.Object({ profileId: t.String() }) },
  )
  .post(
    "/tunnel/disconnect",
    async ({ body }) => {
      const current = await prisma.vpnProfile.findUnique({ where: { id: body.profileId } });
      if (current?.autoConnect)
        return status(409, { error: "Auto mode manages this profile. Turn auto mode off to disconnect" });
      try {
        await tunnel.disconnect(body.profileId);
      } catch (error) {
        return status(409, { error: errorMessage(error) });
      }
      return tunnel.status();
    },
    { body: t.Object({ profileId: t.String() }) },
  )
  .get("/tunnel/logs", ({ query }) => tunnel.getLogs(query.after ?? 0), {
    query: t.Object({ after: t.Optional(t.Numeric({ minimum: 0 })) }),
  })
  .delete("/tunnel/logs", () => {
    tunnel.clearLogs();
    return { ok: true };
  });
