import { existsSync } from "node:fs";
import { staticPlugin } from "@elysiajs/static";
import { createApp } from "./app";
import { prisma } from "./db";
import { stopForwards, syncForwards } from "./relay/forwards";
import { openVpnServer } from "./relay/openvpn-server";
import { startStatsSampler } from "./stats";
import { tunnel } from "./vpn/manager";

const KNOWN_DEFAULT_SECRETS = ["dev-only-secret-change-me", "change-me-please"];
for (const name of ["BETTER_AUTH_SECRET", "PROFILE_ENCRYPTION_KEY"]) {
  const value = process.env[name];
  if (!value || KNOWN_DEFAULT_SECRETS.includes(value))
    console.warn(`[security] ${name} is unset or a known default value; generate one with: openssl rand -hex 32`);
}

const stopStatsSampler = startStatsSampler();
tunnel.onTopologyChange(async () => {
  await syncForwards();
  await openVpnServer.syncTopology();
});
await syncForwards();
const forwardTimer = setInterval(() => void syncForwards(), 5000);
await tunnel.initialize();
tunnel.startWatchdog();
await openVpnServer.start();

void tunnel.autoConnect();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(forwardTimer);
  stopStatsSampler();
  await Promise.allSettled([stopForwards(), openVpnServer.stop()]);
  await tunnel.shutdown();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

const app = createApp();

const dist = process.env.WEB_DIST;
if (dist && existsSync(dist)) {
  app.use(staticPlugin({ assets: dist, prefix: "/", indexHTML: true }));
  const index = () => Bun.file(`${dist}/index.html`);
  app.get("/", index);
  app.onError(({ code, request }) => {
    if (code === "NOT_FOUND" && !new URL(request.url).pathname.startsWith("/api")) return index();
  });
}

const port = Number(process.env.PORT ?? 3000);
app.listen({ hostname: "0.0.0.0", port });
console.log(`tunnel-gate api listening on :${port}`);
