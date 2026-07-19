import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { pipeLines, stopProc } from "../lib/proc";
import { ifaceExists, sh } from "./net";
import type { LogFn, StartedTunnel, TailscaleConfig } from "./types";

const SOCKET = "/tmp/tunnel-gate-tailscale/tailscaled.sock";
const STATE = "/var/lib/tunnel-gate-worker/tailscaled.state";
const IFACE = "tailscale0";

export async function startTailscale(config: TailscaleConfig, log: LogFn): Promise<StartedTunnel> {
  const mode = config.mode ?? "authkey";
  if (mode === "authkey" && !config.authKey) throw new Error("Tailscale auth key is required");
  if (config.hostname && !/^[a-zA-Z0-9-]{1,63}$/.test(config.hostname)) throw new Error("Invalid Tailscale hostname");
  if (config.loginServer && !/^https?:\/\/[^\s]+$/.test(config.loginServer))
    throw new Error("Invalid Tailscale control server URL");

  rmSync("/tmp/tunnel-gate-tailscale", { recursive: true, force: true });
  mkdirSync("/tmp/tunnel-gate-tailscale", { recursive: true, mode: 0o700 });
  mkdirSync("/var/lib/tunnel-gate-worker", { recursive: true, mode: 0o700 });
  const daemon = spawn("tailscaled", [`--state=${STATE}`, `--socket=${SOCKET}`, `--tun=${IFACE}`, "--port=0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeLines(daemon, (line) => log(`[tailscaled] ${line}`));

  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const status = await sh("tailscale", [`--socket=${SOCKET}`, "status", "--json"]);
      if (status.ok) break;
      if (daemon.exitCode !== null) throw new Error(`tailscaled exited with code ${daemon.exitCode}`);
      await sleep(100);
    }

    const args = [`--socket=${SOCKET}`, "up", "--accept-routes=true", "--accept-dns=false", "--reset"];
    if (mode === "authkey") args.push(`--auth-key=${config.authKey}`);
    if (config.hostname) args.push(`--hostname=${config.hostname}`);
    if (config.loginServer) args.push(`--login-server=${config.loginServer}`);
    const up = spawn("tailscale", args, { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      let output = "";
      pipeLines(up, (line) => {
        output += `${line}\n`;
        log(`[tailscale] ${line}`);
        if (/https:\/\/login\.tailscale\.com\/|\/register\//i.test(line)) {
          log("[tailscale] Open the URL above to authorize this VPN worker");
        }
      });
      up.once("error", reject);
      up.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`tailscale up failed: ${output.trim() || `exit code ${code}`}`)),
      );
    });

    for (let attempt = 0; attempt < 100; attempt++) {
      if (ifaceExists(IFACE)) {
        return {
          iface: IFACE,
          stop: async () => {
            await sh("tailscale", [`--socket=${SOCKET}`, "down"]);
            await stopProc(daemon);
          },
        };
      }
      if (daemon.exitCode !== null) throw new Error(`tailscaled exited with code ${daemon.exitCode}`);
      await sleep(100);
    }
    throw new Error("timed out waiting for tailscale0");
  } catch (error) {
    await stopProc(daemon);
    throw error;
  }
}
