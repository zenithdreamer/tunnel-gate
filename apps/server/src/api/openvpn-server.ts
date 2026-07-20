import { Elysia, status, t } from "elysia";
import { store } from "../data";
import { errorMessage } from "../lib/errors";
import { openVpnServer } from "../relay/openvpn-server";

export const openVpnServerApi = new Elysia()
  .get("/openvpn-server/status", async () => {
    const serverStatus = openVpnServer.status();
    const connected = new Set(serverStatus.connectedCommonNames);
    return {
      ...serverStatus,
      devices: (await store.devices()).map((device) => ({
        id: device.id,
        name: device.name,
        commonName: device.commonName,
        createdAt: device.createdAt,
        revokedAt: device.revokedAt,
        connected: connected.has(device.commonName),
      })),
    };
  })
  .patch(
    "/openvpn-server",
    async ({ body }) => {
      try {
        await openVpnServer.setEnabled(body.enabled);
        return openVpnServer.status();
      } catch (error) {
        return status(502, { error: errorMessage(error) });
      }
    },
    { body: t.Object({ enabled: t.Boolean() }) },
  )
  .patch(
    "/openvpn-server/endpoint",
    async ({ body }) => {
      try {
        await openVpnServer.setEndpoint(body.host, body.port);
        return openVpnServer.status();
      } catch (error) {
        return status(400, { error: errorMessage(error) });
      }
    },
    {
      body: t.Object({
        host: t.String({ minLength: 1, maxLength: 253 }),
        port: t.Integer({ minimum: 1, maximum: 65535 }),
      }),
    },
  )
  .post(
    "/openvpn-server/devices",
    async ({ body }) => {
      try {
        const device = await openVpnServer.createDevice(body.name.trim());
        return status(201, { id: device.id });
      } catch (error) {
        return status(502, { error: errorMessage(error) });
      }
    },
    { body: t.Object({ name: t.String({ minLength: 1, maxLength: 80 }) }) },
  )
  .get("/openvpn-server/devices/:id/config", async ({ params, set }) => {
    const device = await store.device(params.id);
    if (!device) return status(404, { error: "device profile not found" });
    try {
      const filename = `${device.name.replace(/[^a-zA-Z0-9_-]+/g, "-") || "tunnel-gate"}.ovpn`;
      set.headers["content-type"] = "application/x-openvpn-profile";
      set.headers["content-disposition"] = `attachment; filename="${filename}"`;
      return openVpnServer.clientConfig(device);
    } catch (error) {
      return status(409, { error: errorMessage(error) });
    }
  })
  .delete("/openvpn-server/devices/:id", async ({ params }) => {
    const device = await store.device(params.id);
    if (!device) return status(404, { error: "device profile not found" });
    try {
      await openVpnServer.revokeDevice(device);
      return { ok: true };
    } catch (error) {
      return status(502, { error: errorMessage(error) });
    }
  });
