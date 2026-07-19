import { Socket } from "node:net";
import { Elysia, t } from "elysia";
import { isSafeDiagnosticHost } from "../domain/network-address";
import { DEFAULT_WINDOW_MS, getSamples } from "../stats";
import { tunnel } from "../vpn/manager";
import { sh } from "../vpn/net";

function checkTcpPort(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (ok: boolean, output: string) => {
      socket.destroy();
      resolve({ ok, output });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, `TCP connection to ${host}:${port} succeeded`));
    socket.once("timeout", () => finish(false, `TCP connection to ${host}:${port} timed out`));
    socket.once("error", (error) => finish(false, `TCP connection to ${host}:${port} failed: ${error.message}`));
    socket.connect(port, host);
  });
}

export const networkSystemApi = new Elysia()
  .post(
    "/net/ping",
    async ({ body }) => {
      const host = body.host.trim();
      if (!isSafeDiagnosticHost(host)) return { ok: false, output: "invalid host" };
      const r = await sh("ping", ["-c", "3", "-W", "2", host]);
      return { ok: r.ok, output: r.out };
    },
    { body: t.Object({ host: t.String({ minLength: 1, maxLength: 255 }) }) },
  )
  .post(
    "/net/diagnostic",
    async ({ body }) => {
      const host = body.host.trim();
      if (!isSafeDiagnosticHost(host)) return { ok: false, output: "invalid host" };

      if (body.tool === "dns") {
        const result = await sh("dig", ["+time=2", "+tries=1", "+short", host]);
        return { ok: result.ok && !!result.out, output: result.out || `No DNS records found for ${host}` };
      }
      if (body.tool === "route") {
        const result = await sh("ip", ["route", "get", host]);
        return { ok: result.ok, output: result.out };
      }

      const port = body.port;
      if (!port) return { ok: false, output: "port is required" };
      return checkTcpPort(host, port);
    },
    {
      body: t.Object({
        tool: t.Union([t.Literal("dns"), t.Literal("route"), t.Literal("tcp")]),
        host: t.String({ minLength: 1, maxLength: 255 }),
        port: t.Optional(t.Integer({ minimum: 1, maximum: 65535 })),
      }),
    },
  )
  .get("/net/routes", async () => {
    const [ipv4, ipv6, rules] = await Promise.all([
      sh("ip", ["-4", "route", "show", "table", "all"]),
      sh("ip", ["-6", "route", "show", "table", "all"]),
      sh("ip", ["rule", "show"]),
    ]);
    return {
      output: [
        "IPv4 ROUTES",
        ipv4.out || "No IPv4 routes",
        "",
        "IPv6 ROUTES",
        ipv6.out || "No IPv6 routes",
        "",
        "POLICY RULES",
        rules.out || "No policy rules",
      ].join("\n"),
    };
  })
  .get("/system/docker", () => tunnel.systemStatus())
  .get(
    "/stats",
    ({ query }) => ({
      ifaces: tunnel.ifaces(),
      samples: getSamples(query.window ?? DEFAULT_WINDOW_MS),
    }),
    { query: t.Object({ window: t.Optional(t.Numeric({ minimum: 0 })) }) },
  );
