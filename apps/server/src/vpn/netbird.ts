import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { pipeLines, stopProc } from "../lib/proc";
import { ifaceExists } from "./net";
import type { LogFn, NetBirdConfig, StartedTunnel } from "./types";

const IFACE = "wt0";

export async function startNetBird(config: NetBirdConfig, log: LogFn): Promise<StartedTunnel> {
  const mode = config.mode ?? "setupkey";
  if (mode === "setupkey" && !config.setupKey) throw new Error("NetBird setup key is required");
  if (config.hostname && !/^[a-zA-Z0-9-]{1,63}$/.test(config.hostname)) throw new Error("Invalid NetBird hostname");
  if (config.managementUrl && !/^https?:\/\/[^\s]+$/.test(config.managementUrl))
    throw new Error("Invalid NetBird management URL");

  mkdirSync("/var/lib/netbird", { recursive: true, mode: 0o700 });
  const args = ["up", "--foreground-mode", "--log-file", "console", "--disable-dns", "--interface-name", IFACE];
  if (mode === "setupkey") args.push("--setup-key", config.setupKey!);
  else args.push("--no-browser");
  if (config.hostname) args.push("--hostname", config.hostname);
  if (config.managementUrl) args.push("--management-url", config.managementUrl);

  const client = spawn("netbird", args, { stdio: ["ignore", "pipe", "pipe"] });
  pipeLines(client, (line) => log(`[netbird] ${line}`));

  try {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (ifaceExists(IFACE)) {
        return { iface: IFACE, stop: async () => stopProc(client) };
      }
      if (client.exitCode !== null) throw new Error(`netbird exited with code ${client.exitCode}`);
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${IFACE}`);
  } catch (error) {
    await stopProc(client);
    throw error;
  }
}
