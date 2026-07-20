import { randomUUID } from "node:crypto";
import { Elysia, status, t } from "elysia";
import { store } from "../data";
import { type PortForward, prisma } from "../db";
import { DEMO, demoCreateForward, demoDeleteForward, demoSetForwardEnabled } from "../demo";
import { prismaErrorCode } from "../lib/errors";
import { forwardPortRange, forwardStatus, syncForwards } from "../relay/forwards";

const forwardBody = t.Object({
  name: t.String({ minLength: 1 }),
  proto: t.Union([t.Literal("tcp"), t.Literal("udp")]),
  listenPort: t.Integer({ minimum: 1, maximum: 65535 }),
  targetHost: t.String({ minLength: 1 }),
  targetPort: t.Integer({ minimum: 1, maximum: 65535 }),
  enabled: t.Boolean({ default: true }),
});

function publicForward(f: PortForward) {
  return {
    id: f.id,
    name: f.name,
    proto: f.proto,
    listenPort: f.listenPort,
    targetHost: f.targetHost,
    targetPort: f.targetPort,
    enabled: f.enabled,
    running: forwardStatus(f.id),
  };
}

export const forwardsApi = new Elysia()
  .get("/config", () => ({ forwardPortRange: forwardPortRange() }))
  .get("/forwards", async () => (await store.forwards()).map(publicForward))
  .post(
    "/forwards",
    async ({ body }) => {
      const range = forwardPortRange();
      if (range && (body.listenPort < range.lo || body.listenPort > range.hi)) {
        return status(422, {
          error: `Listen port must be within ${range.lo}-${range.hi} (published range; set FORWARD_PORT_RANGE to change it)`,
        });
      }
      if (DEMO) return demoCreateForward(body);
      try {
        const created = await prisma.portForward.create({
          data: {
            id: randomUUID(),
            name: body.name,
            proto: body.proto,
            listenPort: body.listenPort,
            targetHost: body.targetHost,
            targetPort: body.targetPort,
            enabled: body.enabled,
          },
        });
        await syncForwards();
        return { id: created.id };
      } catch (error) {
        if (prismaErrorCode(error) !== "P2002") throw error;
        return status(409, { error: "listen port already in use" });
      }
    },
    { body: forwardBody },
  )
  .patch(
    "/forwards/:id",
    async ({ params, body }) => {
      if (DEMO)
        return demoSetForwardEnabled(params.id, body.enabled)
          ? { ok: true }
          : status(404, { error: "forward not found" });
      try {
        await prisma.portForward.update({ where: { id: params.id }, data: { enabled: body.enabled } });
      } catch (error) {
        if (prismaErrorCode(error) !== "P2025") throw error;
        return status(404, { error: "forward not found" });
      }
      await syncForwards();
      return { ok: true };
    },
    { body: t.Object({ enabled: t.Boolean() }) },
  )
  .delete("/forwards/:id", async ({ params }) => {
    if (DEMO) {
      demoDeleteForward(params.id);
      return { ok: true };
    }
    await prisma.portForward.delete({ where: { id: params.id } }).catch(() => {});
    await syncForwards();
    return { ok: true };
  });
