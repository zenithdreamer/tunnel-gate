import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { killByName, pipeLines, stopProc } from "../lib/proc";
import { findPppIface, sh } from "./net";
import type { L2tpConfig, LogFn, StartedTunnel } from "./types";

const CONN = "l2tp-relay";
const LAC = "relay";
const CONTROL = "/var/run/xl2tpd/l2tp-control";
const PPPD_LOG = "/var/run/xl2tpd/pppd.log";
const SWANCTL_CONF = "/etc/swanctl/conf.d/l2tp-relay.conf";
const VICI_SOCKET = "/run/charon.vici";

function filterCharonNoise(l: string): boolean {
  return /^plugin '.*': failed to load/.test(l);
}

// pppd word-splits options, including credentials.
const pppQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function writeConfigs(cfg: L2tpConfig) {
  if (!/^[a-zA-Z0-9.-]+$/.test(cfg.server)) throw new Error("L2TP server must be a hostname or IPv4 address");
  const escapedPsk = cfg.psk
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, "");
  writeFileSync(
    SWANCTL_CONF,
    `connections {
  ${CONN} {
    version = 1
    local_addrs = %any
    remote_addrs = ${cfg.server}
    proposals = aes256-sha1-modp2048,aes256-sha1-modp1024,aes128-sha1-modp1024,3des-sha1-modp1024
    local {
      auth = psk
    }
    remote {
      auth = psk
    }
    children {
      ${CONN} {
        mode = transport
        local_ts = 0.0.0.0/0[udp/1701]
        remote_ts = 0.0.0.0/0[udp/1701]
        esp_proposals = aes256-sha1,aes128-sha1,3des-sha1
        start_action = none
      }
    }
  }
}
secrets {
  ike-${CONN} {
    secret = "${escapedPsk}"
  }
}
`,
    { mode: 0o600 },
  );

  mkdirSync("/etc/xl2tpd", { recursive: true });
  writeFileSync(
    "/etc/xl2tpd/xl2tpd.conf",
    `[global]
port = 1701

[lac ${LAC}]
lns = ${cfg.server}
ppp debug = yes
pppoptfile = /etc/ppp/options.l2tpd.client
length bit = yes
redial = yes
redial timeout = 5
max redials = 3
`,
  );
  writeFileSync(
    "/etc/ppp/options.l2tpd.client",
    `noipdefault
ipcp-accept-local
ipcp-accept-remote
refuse-eap
noccp
noauth
idle 1800
mtu 1280
mru 1280
nodefaultroute
debug
logfile ${PPPD_LOG}
connect-delay 5000
name ${pppQuote(cfg.username)}
password ${pppQuote(cfg.password)}
`,
    { mode: 0o600 },
  );
}

function pppdLogTail(): string {
  try {
    return readFileSync(PPPD_LOG, "utf8").trim().split("\n").slice(-8).join("\n");
  } catch {
    return "";
  }
}

export async function startL2tp(cfg: L2tpConfig, log: LogFn): Promise<StartedTunnel> {
  if (!existsSync("/dev/ppp")) {
    throw new Error(
      "/dev/ppp is missing in the container. Run 'sudo modprobe ppp_generic' on the host and recreate the container with the /dev/ppp device (see docker-compose.yaml).",
    );
  }
  writeConfigs(cfg);
  mkdirSync("/var/run/xl2tpd", { recursive: true });
  rmSync(PPPD_LOG, { force: true });

  await killByName("xl2tpd");
  await killByName("pppd");
  await killByName("charon-systemd");
  rmSync("/var/run/xl2tpd.pid", { force: true });
  rmSync(CONTROL, { force: true });
  rmSync(VICI_SOCKET, { force: true });
  await sleep(500);

  const charon: ChildProcess = spawn("charon-systemd", [], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeLines(charon, (l) => {
    if (filterCharonNoise(l)) return;
    log(`[charon] ${l}`);
  });
  for (let i = 0; i < 40 && !existsSync(VICI_SOCKET); i++) await sleep(250);
  if (!existsSync(VICI_SOCKET)) {
    await stopProc(charon);
    throw new Error("IPSec daemon (charon) failed to start: vici socket never appeared");
  }

  const loaded = await sh("swanctl", ["--load-all"]);
  for (const line of loaded.out.split("\n")) if (!filterCharonNoise(line)) log(`[swanctl] ${line}`);
  const up = await sh("swanctl", ["--initiate", "--child", CONN, "--timeout", "20"]);
  for (const line of up.out.split("\n")) if (!filterCharonNoise(line)) log(`[swanctl] ${line}`);
  if (!up.ok) {
    await sh("swanctl", ["--terminate", "--ike", CONN]);
    await stopProc(charon);
    throw new Error(`IPSec negotiation failed. Check the server address and PSK`);
  }

  let pppdExit: number | null = null;
  const xl2tpd: ChildProcess = spawn("xl2tpd", ["-D", "-c", "/etc/xl2tpd/xl2tpd.conf", "-C", CONTROL], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeLines(xl2tpd, (l) => {
    if (/Can not find tunnel|unable to find call or tunnel to handle packet/.test(l)) return;
    log(`[xl2tpd] ${l}`);
    const m = l.match(/pppd exited .* with code (\d+)/);
    if (m) pppdExit = Number(m[1]);
  });

  const cleanup = async () => {
    try {
      appendFileSync(CONTROL, `d ${LAC}\n`);
    } catch {}
    await stopProc(xl2tpd);
    await sh("swanctl", ["--terminate", "--ike", CONN]);
    await stopProc(charon);
  };

  try {
    for (let i = 0; i < 20 && !existsSync(CONTROL); i++) await sleep(250);
    if (!existsSync(CONTROL)) throw new Error("xl2tpd control socket never appeared");
    appendFileSync(CONTROL, `c ${LAC}\n`);
    log(`[l2tp] dialing ${cfg.server} ...`);

    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      if (xl2tpd.exitCode !== null) throw new Error("xl2tpd exited during dial");
      if (pppdExit !== null) {
        const tail = pppdLogTail();
        if (tail) for (const line of tail.split("\n")) log(`[pppd] ${line}`);
        if (/PAP authentication failed|Failed to authenticate/i.test(tail)) {
          throw new Error("L2TP username or password was rejected");
        }
        throw new Error(
          `pppd exited with code ${pppdExit}${tail ? `: ${tail.split("\n").at(-1)}` : ". See the tunnel log for details"}`,
        );
      }
      const ppp = findPppIface();
      if (ppp) {
        log(`[l2tp] ${ppp.iface} up with address ${ppp.addr}`);
        return { iface: ppp.iface, endpoint: cfg.server, stop: cleanup };
      }
    }
    const tail = pppdLogTail();
    if (tail) for (const line of tail.split("\n")) log(`[pppd] ${line}`);
    throw new Error("Timed out waiting for the PPP interface. See the [pppd] lines in the tunnel log");
  } catch (e) {
    await cleanup();
    throw e;
  }
}
