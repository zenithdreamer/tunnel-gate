import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import type { ProfileConfig, ProfileType } from "../domain/profile-config";
import { startL2tp } from "./l2tp";
import { ifaceAddr, ifaceExists, pinEndpoint, sh, unpinEndpoint } from "./net";
import { startNetBird } from "./netbird";
import { startOpenVpn } from "./openvpn";
import { startTailscale } from "./tailscale";
import type {
  L2tpConfig,
  NetBirdConfig,
  OpenVpnConfig,
  StartedTunnel,
  TailscaleConfig,
  WireGuardConfig,
} from "./types";
import { startWireGuard } from "./wireguard";
import { formatWorkerStatus, type WorkerStatusEvent } from "./worker-status";

interface WorkerProfile {
  id: string;
  name: string;
  type: ProfileType;
  config: ProfileConfig;
  routes: string[];
  dnsServers: string[];
}

const configPath = process.argv[2];
if (!configPath || !existsSync(configPath)) throw new Error("worker profile configuration is missing");
const profile = JSON.parse(readFileSync(configPath, "utf8")) as WorkerProfile;
let started: StartedTunnel | null = null;
let pinnedEndpoint: string | null = null;
let stopping = false;

function status(event: WorkerStatusEvent) {
  console.log(formatWorkerStatus(event));
}

function log(line: string) {
  console.log(line);
  if (profile.type !== "tailscale" && profile.type !== "netbird") return;
  const url = line.match(/https?:\/\/[^\s]+/)?.[0];
  if (!url) return;
  const isLoginUrl =
    profile.type === "tailscale"
      ? /login\.tailscale\.com|\/register\//i.test(url)
      : /login|auth|browser|verify|sso/i.test(line);
  if (isLoginUrl) status({ state: "login", url });
}

function counters(iface: string) {
  try {
    return {
      rx: Number(readFileSync(`/sys/class/net/${iface}/statistics/rx_bytes`, "utf8")),
      tx: Number(readFileSync(`/sys/class/net/${iface}/statistics/tx_bytes`, "utf8")),
    };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

async function configureForwarding(iface: string) {
  const required = async (program: string, args: string[]) => {
    const result = await sh(program, args);
    if (!result.ok) throw new Error(`${program} ${args.join(" ")} failed: ${result.out}`);
  };
  if (readFileSync("/proc/sys/net/ipv4/ip_forward", "utf8").trim() !== "1") {
    throw new Error("IPv4 forwarding is disabled in the VPN worker");
  }
  await required("iptables", ["-A", "FORWARD", "-i", "eth0", "-o", iface, "-j", "ACCEPT"]);
  await required("iptables", [
    "-A",
    "FORWARD",
    "-i",
    iface,
    "-o",
    "eth0",
    "-m",
    "conntrack",
    "--ctstate",
    "RELATED,ESTABLISHED",
    "-j",
    "ACCEPT",
  ]);
  await required("iptables", ["-t", "nat", "-A", "POSTROUTING", "-o", iface, "-j", "MASQUERADE"]);
}

async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (pinnedEndpoint) await unpinEndpoint(pinnedEndpoint);
  await started?.stop().catch(() => {});
}

async function run() {
  status({ state: "connecting" });
  started =
    profile.type === "openvpn"
      ? await startOpenVpn(profile.config as OpenVpnConfig, profile.id, log)
      : profile.type === "wireguard"
        ? await startWireGuard(profile.config as WireGuardConfig, "wg-vpn", log)
        : profile.type === "tailscale"
          ? await startTailscale(profile.config as TailscaleConfig, log)
          : profile.type === "netbird"
            ? await startNetBird(profile.config as NetBirdConfig, log)
            : await startL2tp(profile.config as L2tpConfig, log);

  if (started.endpoint) {
    try {
      pinnedEndpoint = (await lookup(started.endpoint, { family: 4 })).address;
      await pinEndpoint(pinnedEndpoint, log);
    } catch {
      log(`could not resolve endpoint ${started.endpoint}; skipping pin`);
    }
  }
  for (const route of profile.routes) {
    const result = await sh("ip", ["route", "replace", route, "dev", started.iface]);
    if (!result.ok) throw new Error(`failed to install worker route ${route}: ${result.out}`);
    log(`route ${route} -> ${started.iface}`);
  }
  await configureForwarding(started.iface);
  const address = await ifaceAddr(started.iface);
  status({
    state: "connected",
    iface: started.iface,
    addr: address,
    endpoint: pinnedEndpoint ?? started.endpoint ?? null,
  });

  setInterval(async () => {
    if (!started) return;
    if (!(await ifaceExists(started.iface))) {
      status({ state: "error", error: `tunnel interface ${started.iface} disappeared` });
      await cleanup();
      process.exit(1);
    }
    status({ state: "stats", ...counters(started.iface) });
  }, 2000);
}

process.on("SIGTERM", () => void cleanup().finally(() => process.exit(0)));
process.on("SIGINT", () => void cleanup().finally(() => process.exit(0)));

run().catch(async (error) => {
  status({ state: "error", error: error instanceof Error ? error.message : String(error) });
  await cleanup();
  process.exit(1);
});
