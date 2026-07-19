import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "../db";
import { pipeLines, stopProc } from "../lib/proc";
import type { LogFn, OpenVpnConfig, StartedTunnel } from "./types";

const CONNECT_TIMEOUT_MS = 60_000;

export function prepareOpenVpnConfig(ovpn: string, credsPath: string | null): string {
  const cleaned =
    ovpn
      .replace(/^\s*<auth-user-pass>[\s\S]*?<\/auth-user-pass>\s*$/gm, "")
      .replace(/^\s*auth-user-pass.*$/gm, "")
      .trimEnd() + "\n";
  return credsPath ? `${cleaned}auth-user-pass ${credsPath}\n` : cleaned;
}

export async function startOpenVpn(cfg: OpenVpnConfig, profileId: string, log: LogFn): Promise<StartedTunnel> {
  const dir = join(STATE_DIR, "openvpn", profileId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const args = ["--config", join(dir, "profile.ovpn"), "--verb", "3"];
  const credsPath = cfg.username ? join(dir, "creds.txt") : null;
  if (credsPath)
    writeFileSync(credsPath, `${cfg.username}\n${cfg.password ?? ""}\n`, {
      mode: 0o600,
    });
  writeFileSync(join(dir, "profile.ovpn"), prepareOpenVpnConfig(cfg.ovpn, credsPath), { mode: 0o600 });

  const proc = spawn("openvpn", args, { stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolvePromise, reject) => {
    let iface = "tun0";
    let endpoint: string | undefined;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        reject(new Error("openvpn: timed out waiting for Initialization Sequence Completed"));
      }
    }, CONNECT_TIMEOUT_MS);

    const onLine = (line: string) => {
      log(`[openvpn] ${line}`);
      const dev = line.match(/TUN\/TAP device (\S+) opened/);
      if (dev) iface = dev[1];
      const peer = line.match(/Peer Connection Initiated with \[AF_INET6?\]([0-9a-fA-F.:]+):\d+/);
      if (peer) endpoint = peer[1];
      if (line.includes("Initialization Sequence Completed") && !settled) {
        settled = true;
        clearTimeout(timer);
        resolvePromise({ iface, endpoint, stop: () => stopProc(proc) });
      }
      if (line.includes("AUTH_FAILED") && !settled) {
        settled = true;
        clearTimeout(timer);
        proc.kill("SIGTERM");
        reject(new Error("openvpn: authentication failed"));
      }
    };
    pipeLines(proc, onLine);

    proc.on("exit", (code) => {
      log(`[openvpn] exited with code ${code}`);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`openvpn exited early (code ${code})`));
      }
    });
  });
}
