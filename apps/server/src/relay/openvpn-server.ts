import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type OpenVpnDevice, prisma, STATE_DIR } from "../db";
import {
  DEMO,
  DEMO_OPENVPN_HOST,
  DEMO_OPENVPN_PORT,
  demoConnectedCommonNames,
  demoCreateDevice,
  demoDeleteDevice,
  demoProfiles,
} from "../demo";
import { parseIPv4Cidr } from "../domain/network-address";
import { aggregateAdvertisedNetwork } from "../domain/profile-routes";
import { CoalescedTask } from "../lib/coalesced-task";
import { errorMessage } from "../lib/errors";
import { pipeLines, stopProc } from "../lib/proc";
import { tunnel } from "../vpn/manager";
import { sh } from "../vpn/net";
import { caConfig } from "./openvpn/ca-config";
import { serverConfig } from "./openvpn/server-config";
import { parseConnectedCommonNames } from "./openvpn/status";

const DIR = join(STATE_DIR, "tunnel-gate-openvpn-server");
const DEVICES_DIR = join(DIR, "devices");
const NEW_CERTS_DIR = join(DIR, "newcerts");
const CA_KEY = join(DIR, "ca.key");
const CA_CERT = join(DIR, "ca.crt");
const CA_CONFIG = join(DIR, "ca.cnf");
const SERVER_KEY = join(DIR, "server.key");
const SERVER_CERT = join(DIR, "server.crt");
const CRL = join(DIR, "crl.pem");
const TLS_CRYPT = join(DIR, "tls-crypt.key");
const SERVER_CONFIG = join(DIR, "server.conf");
const STATUS_FILE = join(DIR, "status.csv");
const PID_FILE = join(DIR, "server.pid");
const SERVER_SUBNET = "10.250.0.0";
const SERVER_NETMASK = "255.255.255.0";
const SERVER_CIDR = `${SERVER_SUBNET}/24`;
const SERVER_IFACE = "tun-relay";

const SETTINGS = {
  enabled: "openvpn_server_enabled",
  host: "openvpn_server_host",
  port: "openvpn_server_port",
} as const;

function writePrivate(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function command(program: string, args: string[]) {
  const result = await sh(program, args);
  if (!result.ok) throw new Error(`${program} failed: ${result.out}`);
}

async function ensurePki() {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  mkdirSync(DEVICES_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(NEW_CERTS_DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  writePrivate(CA_CONFIG, caConfig(DIR));
  if (!existsSync(join(DIR, "index.txt"))) writePrivate(join(DIR, "index.txt"), "");
  if (!existsSync(join(DIR, "serial"))) writePrivate(join(DIR, "serial"), "1000\n");
  if (!existsSync(join(DIR, "crlnumber"))) writePrivate(join(DIR, "crlnumber"), "1000\n");

  if (!existsSync(CA_KEY) || !existsSync(CA_CERT)) {
    await command("openssl", ["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072", "-out", CA_KEY]);
    await command("openssl", [
      "req",
      "-x509",
      "-new",
      "-key",
      CA_KEY,
      "-sha256",
      "-days",
      "3650",
      "-subj",
      "/CN=tunnel-gate-ca",
      "-out",
      CA_CERT,
    ]);
    chmodSync(CA_KEY, 0o600);
  }
  if (!existsSync(SERVER_KEY) || !existsSync(SERVER_CERT)) {
    const csr = join(DIR, "server.csr");
    await command("openssl", ["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", SERVER_KEY]);
    await command("openssl", ["req", "-new", "-key", SERVER_KEY, "-subj", "/CN=tunnel-gate-server", "-out", csr]);
    await command("openssl", [
      "ca",
      "-batch",
      "-notext",
      "-config",
      CA_CONFIG,
      "-extensions",
      "server_cert",
      "-in",
      csr,
      "-out",
      SERVER_CERT,
    ]);
    chmodSync(SERVER_KEY, 0o600);
  }
  if (!existsSync(TLS_CRYPT)) {
    await command("openvpn", ["--genkey", "secret", TLS_CRYPT]);
    chmodSync(TLS_CRYPT, 0o600);
  }
  if (!existsSync(CRL)) await command("openssl", ["ca", "-batch", "-config", CA_CONFIG, "-gencrl", "-out", CRL]);
}

async function configuredNetwork() {
  return aggregateAdvertisedNetwork(await prisma.vpnProfile.findMany());
}

async function ensureJump(table: string | null, chain: string, args: string[]) {
  const prefix = table ? ["-t", table] : [];
  const check = await sh("iptables", [...prefix, "-C", chain, ...args]);
  if (!check.ok) await command("iptables", [...prefix, "-A", chain, ...args]);
}

async function syncFirewall() {
  await sh("iptables", ["-N", "TUNNEL_GATE_FWD"]);
  await sh("iptables", ["-t", "nat", "-N", "TUNNEL_GATE_NAT"]);
  await command("iptables", ["-F", "TUNNEL_GATE_FWD"]);
  await command("iptables", ["-t", "nat", "-F", "TUNNEL_GATE_NAT"]);
  await ensureJump(null, "FORWARD", ["-i", SERVER_IFACE, "-j", "TUNNEL_GATE_FWD"]);
  await ensureJump(null, "FORWARD", [
    "-o",
    SERVER_IFACE,
    "-m",
    "conntrack",
    "--ctstate",
    "RELATED,ESTABLISHED",
    "-j",
    "ACCEPT",
  ]);
  await ensureJump("nat", "POSTROUTING", ["-s", SERVER_CIDR, "-j", "TUNNEL_GATE_NAT"]);

  for (const session of tunnel.forwardingRoutes()) {
    for (const cidr of session.routes) {
      if (!parseIPv4Cidr(cidr)) continue;
      await command("iptables", ["-A", "TUNNEL_GATE_FWD", "-d", cidr, "-j", "ACCEPT"]);
      await command("iptables", ["-t", "nat", "-A", "TUNNEL_GATE_NAT", "-d", cidr, "-j", "MASQUERADE"]);
    }
  }
  await command("iptables", ["-A", "TUNNEL_GATE_FWD", "-j", "DROP"]);
}

async function clearFirewall() {
  await sh("iptables", ["-D", "FORWARD", "-i", SERVER_IFACE, "-j", "TUNNEL_GATE_FWD"]);
  await sh("iptables", [
    "-D",
    "FORWARD",
    "-o",
    SERVER_IFACE,
    "-m",
    "conntrack",
    "--ctstate",
    "RELATED,ESTABLISHED",
    "-j",
    "ACCEPT",
  ]);
  await sh("iptables", ["-t", "nat", "-D", "POSTROUTING", "-s", SERVER_CIDR, "-j", "TUNNEL_GATE_NAT"]);
  await sh("iptables", ["-F", "TUNNEL_GATE_FWD"]);
  await sh("iptables", ["-t", "nat", "-F", "TUNNEL_GATE_NAT"]);
  await sh("iptables", ["-X", "TUNNEL_GATE_FWD"]);
  await sh("iptables", ["-t", "nat", "-X", "TUNNEL_GATE_NAT"]);
}

export interface OpenVpnServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  protocol: "udp";
  subnet: string;
  host: string;
  routes: string[];
  dnsServers: string[];
  connectedCommonNames: string[];
  lastError: string | null;
}

export interface OpenVpnServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  syncTopology(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  setEndpoint(host: string, port: number): Promise<void>;
  createDevice(name: string): Promise<OpenVpnDevice>;
  revokeDevice(device: OpenVpnDevice): Promise<void>;
  clientConfig(device: OpenVpnDevice): string;
  status(): OpenVpnServerStatus;
}

export class OpenVpnServerManager implements OpenVpnServer {
  private process: ChildProcess | null = null;
  private routeFingerprint = "";
  private advertisedRoutes: string[] = [];
  private dnsServers: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastError: string | null = null;
  private enabled = false;
  private host = process.env.OPENVPN_SERVER_HOST ?? "localhost";
  private port = Number(process.env.OPENVPN_SERVER_PORT ?? 1194);
  private forceRestart = false;
  private readonly reconciliation = new CoalescedTask(() => this.reconcileOnce());

  syncTopology() {
    return this.reconcile(false);
  }

  async start() {
    try {
      const settings = await prisma.relaySetting.findMany({
        where: { key: { in: Object.values(SETTINGS) } },
      });
      const values = new Map(settings.map((setting) => [setting.key, setting.value]));
      const configuredPort = Number(values.get(SETTINGS.port) ?? this.port);
      this.enabled = values.get(SETTINGS.enabled) === "true";
      this.host = values.get(SETTINGS.host) ?? this.host;
      this.port =
        Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535 ? configuredPort : 1194;

      const revokedDevices = await prisma.openVpnDevice.findMany({ where: { revokedAt: { not: null } } });
      if (revokedDevices.length) {
        await prisma.openVpnDevice.deleteMany({ where: { revokedAt: { not: null } } });
        for (const device of revokedDevices) rmSync(join(DEVICES_DIR, device.id), { recursive: true, force: true });
      }
      if (this.enabled) {
        await ensurePki();
        await this.reconcile(true);
      } else {
        await this.stopServer();
      }
    } catch (error) {
      this.lastError = errorMessage(error);
      console.error(`[openvpn-server] ${this.lastError}`);
    } finally {
      this.timer = setInterval(() => void this.reconcile(false), 5000);
    }
  }

  private reconcile(forceRestart: boolean) {
    this.forceRestart ||= forceRestart;
    return this.reconciliation.run();
  }

  private async reconcileOnce() {
    if (!this.enabled) return;
    const forceRestart = this.forceRestart;
    this.forceRestart = false;
    try {
      const network = await configuredNetwork();
      const fingerprint = JSON.stringify(network);
      if (forceRestart || fingerprint !== this.routeFingerprint || !this.process || this.process.exitCode !== null) {
        this.routeFingerprint = fingerprint;
        this.advertisedRoutes = network.routes;
        this.dnsServers = network.dnsServers;
        await this.restart(network.routes, network.dnsServers);
      }
      await syncFirewall();
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      console.error(`[openvpn-server] ${this.lastError}`);
    }
  }

  private async stopServer() {
    if (this.process) {
      await stopProc(this.process);
      this.process = null;
    } else if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8").trim());
      if (Number.isInteger(pid) && pid > 1) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {}
      }
    }
    rmSync(PID_FILE, { force: true });
    await clearFirewall();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.stopServer();
  }

  async setEnabled(enabled: boolean) {
    await prisma.relaySetting.upsert({
      where: { key: SETTINGS.enabled },
      create: { key: SETTINGS.enabled, value: String(enabled) },
      update: { value: String(enabled) },
    });
    this.enabled = enabled;
    if (enabled) {
      await ensurePki();
      await this.reconcile(true);
    } else {
      await this.stopServer();
      this.lastError = null;
    }
  }

  async setEndpoint(host: string, port: number) {
    const normalizedHost = host.trim();
    if (!normalizedHost || normalizedHost.length > 253 || /\s/.test(normalizedHost))
      throw new Error("Invalid OpenVPN server host");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid OpenVPN server port");

    const portChanged = port !== this.port;
    await prisma.$transaction([
      prisma.relaySetting.upsert({
        where: { key: SETTINGS.host },
        create: { key: SETTINGS.host, value: normalizedHost },
        update: { value: normalizedHost },
      }),
      prisma.relaySetting.upsert({
        where: { key: SETTINGS.port },
        create: { key: SETTINGS.port, value: String(port) },
        update: { value: String(port) },
      }),
    ]);
    this.host = normalizedHost;
    this.port = port;
    if (this.enabled && portChanged) await this.reconcile(true);
  }

  private async restart(routes: string[], dnsServers: string[]) {
    if (this.process) await stopProc(this.process);
    if (existsSync(PID_FILE)) {
      const stalePid = Number(readFileSync(PID_FILE, "utf8").trim());
      if (Number.isInteger(stalePid) && stalePid > 1) {
        try {
          process.kill(stalePid, "SIGTERM");
        } catch {}
      }
    }
    writePrivate(
      SERVER_CONFIG,
      serverConfig({
        routes,
        dnsServers,
        port: this.port,
        interfaceName: SERVER_IFACE,
        subnet: SERVER_SUBNET,
        netmask: SERVER_NETMASK,
        caCert: CA_CERT,
        serverCert: SERVER_CERT,
        serverKey: SERVER_KEY,
        crl: CRL,
        tlsCrypt: TLS_CRYPT,
        pidFile: PID_FILE,
        statusFile: STATUS_FILE,
      }),
    );
    const child = spawn("openvpn", ["--config", SERVER_CONFIG], { stdio: ["ignore", "pipe", "pipe"] });
    this.process = child;
    pipeLines(child, (line) => console.log(`[openvpn-server] ${line}`));
    child.on("error", (error) => {
      this.lastError = error.message;
    });
    child.on("exit", (code) => {
      if (this.process === child && code) this.lastError = `OpenVPN server exited with code ${code}`;
    });
  }

  async createDevice(name: string) {
    const id = randomUUID();
    const commonName = `device-${id.replaceAll("-", "")}`;
    await ensurePki();
    const deviceDir = join(DEVICES_DIR, id);
    mkdirSync(deviceDir, { recursive: true, mode: 0o700 });
    const key = join(deviceDir, "client.key");
    const csr = join(deviceDir, "client.csr");
    const cert = join(deviceDir, "client.crt");
    await command("openssl", ["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", key]);
    await command("openssl", ["req", "-new", "-key", key, "-subj", `/CN=${commonName}`, "-out", csr]);
    await command("openssl", [
      "ca",
      "-batch",
      "-notext",
      "-config",
      CA_CONFIG,
      "-extensions",
      "client_cert",
      "-in",
      csr,
      "-out",
      cert,
    ]);
    chmodSync(key, 0o600);
    return prisma.openVpnDevice.create({ data: { id, name, commonName, createdAt: Math.floor(Date.now() / 1000) } });
  }

  async revokeDevice(device: OpenVpnDevice) {
    const cert = join(DEVICES_DIR, device.id, "client.crt");
    if (!device.revokedAt && existsSync(cert)) {
      await command("openssl", ["ca", "-batch", "-config", CA_CONFIG, "-revoke", cert]);
      await command("openssl", ["ca", "-batch", "-config", CA_CONFIG, "-gencrl", "-out", CRL]);
    }
    await prisma.openVpnDevice.delete({ where: { id: device.id } });
    rmSync(join(DEVICES_DIR, device.id), { recursive: true, force: true });
    await this.reconcile(true);
  }

  clientConfig(device: OpenVpnDevice) {
    if (device.revokedAt) throw new Error("This device profile has been revoked");
    const deviceDir = join(DEVICES_DIR, device.id);
    const cert = join(deviceDir, "client.crt");
    const key = join(deviceDir, "client.key");
    if (!existsSync(cert) || !existsSync(key)) throw new Error("Device certificate files are missing");
    return `client
dev tun
proto udp
remote ${this.host} ${this.port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
verify-x509-name tunnel-gate-server name
auth SHA256
cipher AES-256-GCM
data-ciphers AES-256-GCM:AES-128-GCM
auth-nocache
verb 3
<ca>
${readFileSync(CA_CERT, "utf8").trim()}
</ca>
<cert>
${readFileSync(cert, "utf8").trim()}
</cert>
<key>
${readFileSync(key, "utf8").trim()}
</key>
<tls-crypt>
${readFileSync(TLS_CRYPT, "utf8").trim()}
</tls-crypt>
`;
  }

  status(): OpenVpnServerStatus {
    const running = this.process !== null && this.process.exitCode === null;
    // The status file outlives the process, only trust it while the server runs.
    const clients =
      running && existsSync(STATUS_FILE) ? parseConnectedCommonNames(readFileSync(STATUS_FILE, "utf8")) : [];
    return {
      enabled: this.enabled,
      running,
      port: this.port,
      protocol: "udp",
      subnet: SERVER_CIDR,
      host: this.host,
      routes: this.advertisedRoutes,
      dnsServers: this.dnsServers,
      connectedCommonNames: clients,
      lastError: this.lastError,
    };
  }
}

class DemoOpenVpnServer implements OpenVpnServer {
  private enabled = true;
  private host = DEMO_OPENVPN_HOST;
  private port = DEMO_OPENVPN_PORT;

  async start() {}
  async stop() {}
  async syncTopology() {}

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async setEndpoint(host: string, port: number) {
    this.host = host.trim();
    this.port = port;
  }

  async createDevice(name: string): Promise<OpenVpnDevice> {
    return demoCreateDevice(name);
  }

  async revokeDevice(device: OpenVpnDevice) {
    demoDeleteDevice(device.id);
  }

  clientConfig(device: OpenVpnDevice) {
    return `# Demo profile for ${device.name} - not a real, usable OpenVPN config.
client
dev tun
proto udp
remote ${this.host} ${this.port}
remote-cert-tls server
auth SHA256
cipher AES-256-GCM
verb 3
<ca>
-----BEGIN CERTIFICATE-----
MIIB<demo-ca-certificate-not-real>
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
MIIB<demo-client-certificate-not-real-cn-${device.commonName}>
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN PRIVATE KEY-----
MIIB<demo-client-key-not-real>
-----END PRIVATE KEY-----
</key>
`;
  }

  status(): OpenVpnServerStatus {
    const network = aggregateAdvertisedNetwork(demoProfiles());
    return {
      enabled: this.enabled,
      running: this.enabled,
      port: this.port,
      protocol: "udp",
      subnet: SERVER_CIDR,
      host: this.host,
      routes: network.routes,
      dnsServers: network.dnsServers,
      connectedCommonNames: demoConnectedCommonNames(),
      lastError: null,
    };
  }
}

export const openVpnServer: OpenVpnServer = DEMO ? new DemoOpenVpnServer() : new OpenVpnServerManager();
