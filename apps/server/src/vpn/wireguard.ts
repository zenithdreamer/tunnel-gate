import { mkdirSync, writeFileSync } from "node:fs";
import { sh } from "./net";
import type { LogFn, StartedTunnel, WireGuardConfig } from "./types";

export async function startWireGuard(cfg: WireGuardConfig, iface: string, log: LogFn): Promise<StartedTunnel> {
  mkdirSync("/etc/wireguard", { recursive: true, mode: 0o700 });
  // The controller owns destination routing and DNS. Prevent wg-quick from
  // turning broad AllowedIPs into worker default routes and policy rules.
  const conf = cfg.conf
    .replace(/^\s*(?:Table|DNS)\s*=.*$/gim, "")
    .replace(/^\s*\[Interface\]\s*$/im, (line) => `${line}\nTable = off`);
  writeFileSync(`/etc/wireguard/${iface}.conf`, conf, { mode: 0o600 });

  await sh("wg-quick", ["down", iface]);

  const up = await sh("wg-quick", ["up", iface]);
  for (const line of up.out.split("\n")) log(`[wg] ${line}`);
  if (!up.ok) throw new Error(`wg-quick up failed: ${up.out}`);

  const endpoint = cfg.conf.match(/^\s*Endpoint\s*=\s*\[?([^\]\s:]+)/im)?.[1];
  return {
    iface,
    endpoint,
    stop: async () => {
      const down = await sh("wg-quick", ["down", iface]);
      for (const line of down.out.split("\n")) log(`[wg] ${line}`);
    },
  };
}
