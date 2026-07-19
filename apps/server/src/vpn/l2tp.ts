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

// pppd word-splits options, including credentials.
const pppQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function writeConfigs(cfg: L2tpConfig) {
  if (!/^[a-zA-Z0-9.-]+$/.test(cfg.server)) throw new Error("L2TP server must be a hostname or IPv4 address");
  const escapedPsk = cfg.psk
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, "");
  writeFileSync(
    "/etc/ipsec.conf",
    `config setup
  uniqueids=no

conn ${CONN}
  keyexchange=ikev1
  authby=secret
  type=transport
  left=%defaultroute
  leftprotoport=17/1701
  right=${cfg.server}
  rightid=%any
  rightprotoport=17/1701
  ike=aes256-sha1-modp2048,aes256-sha1-modp1024,aes128-sha1-modp1024,3des-sha1-modp1024!
  esp=aes256-sha1,aes128-sha1,3des-sha1!
  auto=add
`,
  );
  // Accept either hostname or resolved-IP peer identities.
  writeFileSync("/etc/ipsec.secrets", `%any %any : PSK "${escapedPsk}"\n`, { mode: 0o600 });

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
  rmSync("/var/run/xl2tpd.pid", { force: true });
  rmSync(CONTROL, { force: true });
  await sleep(500);

  await sh("ipsec", ["stop"]);
  const start = await sh("ipsec", ["start"]);
  log(`[ipsec] start: ${start.out || "ok"}`);
  await sleep(2500);
  const up = await sh("ipsec", ["up", CONN]);
  for (const line of up.out.split("\n")) log(`[ipsec] ${line}`);
  if (!/established successfully|INSTALLED/i.test(up.out)) {
    await sh("ipsec", ["stop"]);
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
    await sh("ipsec", ["down", CONN]);
    await sh("ipsec", ["stop"]);
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
