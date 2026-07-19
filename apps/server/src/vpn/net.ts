import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function sh(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await exec(cmd, args);
    return { ok: true, out: (stdout + stderr).trim() };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      out: ((failure.stdout ?? "") + (failure.stderr ?? "") + failure.message).trim(),
    };
  }
}

export function ifaceAddr(iface: string): string | null {
  return networkInterfaces()[iface]?.find((addr) => addr.family === "IPv4")?.address ?? null;
}

export function ifaceExists(iface: string): boolean {
  return iface in networkInterfaces();
}

export function findPppIface(): { iface: string; addr: string } | null {
  for (const [iface, addrs] of Object.entries(networkInterfaces())) {
    if (!/^ppp\d+$/.test(iface)) continue;
    const addr = addrs?.find((a) => a.family === "IPv4")?.address;
    if (addr) return { iface, addr };
  }
  return null;
}

function hexToIPv4(hex: string): string {
  const bytes = hex.match(/../g) ?? [];
  return bytes
    .reverse()
    .map((byte) => Number.parseInt(byte, 16))
    .join(".");
}

function defaultRoute(): { iface: string; gateway: string | null } | null {
  try {
    const lines = readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
    for (const line of lines) {
      const [iface, destination, gateway] = line.trim().split(/\s+/);
      if (destination === "00000000") {
        const gatewayAddr = gateway && gateway !== "00000000" ? hexToIPv4(gateway) : null;
        return { iface, gateway: gatewayAddr };
      }
    }
  } catch {}
  return null;
}

export function defaultIface(): string {
  return defaultRoute()?.iface ?? "eth0";
}

export async function pinEndpoint(ip: string, log: (l: string) => void) {
  const route = defaultRoute();
  if (!route) return;
  const args = ["route", "replace", `${ip}/32`];
  if (route.gateway) args.push("via", route.gateway);
  args.push("dev", route.iface);
  const r = await sh("ip", args);
  log(r.ok ? `endpoint ${ip} pinned to ${route.iface}` : `endpoint pin failed: ${r.out}`);
}

export async function unpinEndpoint(ip: string) {
  await sh("ip", ["route", "del", `${ip}/32`]);
}
