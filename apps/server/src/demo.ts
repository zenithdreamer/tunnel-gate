import { randomUUID } from "node:crypto";
import type { OpenVpnDevice, PortForward, VpnProfile } from "./db";
import type { ProfileType } from "./domain/profile-config";
import { encryptProfileConfig } from "./profile-crypto";
import { formatBinaryBytes } from "./vpn/docker-usage";

export const DEMO = process.env.DEMO === "true";

export const DEMO_OPENVPN_HOST = "vpn.demo-tunnelgate.net";
export const DEMO_OPENVPN_PORT = 1194;

export const DEMO_CREDENTIALS = {
  email: "demo@tunnel-gate.app",
  password: "demodemo",
};

export const DEMO_USER = {
  id: "demo-user",
  name: "Demo Admin",
  email: DEMO_CREDENTIALS.email,
  emailVerified: true,
  image: null as string | null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

export function demoSession() {
  const now = new Date();
  return {
    user: DEMO_USER,
    session: {
      id: "demo-session",
      userId: DEMO_USER.id,
      token: "demo",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
      ipAddress: null as string | null,
      userAgent: null as string | null,
    },
  };
}

export interface DemoPresentation {
  iface: string;
  addr: string;
  gateway: string;
  endpoint: string;
  rxRate: number; // bytes/sec
  txRate: number;
}

interface DemoProfileSeed {
  id: string;
  name: string;
  type: ProfileType;
  config: Record<string, unknown>;
  routes: string[];
  dnsServers: string[];
  autoConnect: boolean;
  connectedSinceHoursAgo: number;
  presentation: DemoPresentation;
}

const SAMPLE_OVPN = `client
dev tun
proto udp
remote HOST PORT
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3
<ca>
-----BEGIN CERTIFICATE-----
MIIB<demo-ca-certificate-not-real>
-----END CERTIFICATE-----
</ca>`;

const SAMPLE_WG = `[Interface]
PrivateKey = <demo-private-key-not-real>=
Address = ADDR/32
DNS = 10.10.0.1

[Peer]
PublicKey = <demo-public-key-not-real>=
Endpoint = HOST:PORT
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

const DEMO_PROFILES: DemoProfileSeed[] = [
  {
    id: "demo-openvpn-nyc",
    name: "US East - New York",
    type: "openvpn",
    config: {
      ovpn: SAMPLE_OVPN.replace("HOST", "us-nyc-01.demo-tunnelgate.net").replace("PORT", "1194"),
    },
    routes: ["10.8.0.0/24"],
    dnsServers: ["10.8.0.1"],
    autoConnect: true,
    connectedSinceHoursAgo: 6.2,
    presentation: {
      iface: "tun0",
      addr: "10.8.0.14",
      gateway: "172.20.0.4",
      endpoint: "us-nyc-01.demo-tunnelgate.net:1194",
      rxRate: 820_000,
      txRate: 240_000,
    },
  },
  {
    id: "demo-wireguard-fra",
    name: "EU - Frankfurt",
    type: "wireguard",
    config: {
      conf: SAMPLE_WG.replace("HOST", "eu-fra-02.demo-tunnelgate.net")
        .replace("PORT", "51820")
        .replace("ADDR", "10.10.0.7"),
    },
    routes: ["10.10.0.0/24"],
    dnsServers: ["10.10.0.1"],
    autoConnect: true,
    connectedSinceHoursAgo: 31.5,
    presentation: {
      iface: "wg0",
      addr: "10.10.0.7",
      gateway: "172.20.0.5",
      endpoint: "eu-fra-02.demo-tunnelgate.net:51820",
      rxRate: 1_450_000,
      txRate: 410_000,
    },
  },
  {
    id: "demo-tailscale-corp",
    name: "Tailnet - corp",
    type: "tailscale",
    config: {
      mode: "authkey",
      authKey: "tskey-auth-demoNotReal0000000000",
      hostname: "tunnel-gate",
    },
    routes: ["100.100.10.0/24"],
    dnsServers: [],
    autoConnect: false,
    connectedSinceHoursAgo: 74.1,
    presentation: {
      iface: "tailscale0",
      addr: "100.100.10.32",
      gateway: "172.20.0.6",
      endpoint: "controlplane.tailscale.com",
      rxRate: 96_000,
      txRate: 61_000,
    },
  },
  {
    id: "demo-l2tp-homelab",
    name: "Home Lab (L2TP)",
    type: "l2tp",
    config: {
      server: "home.demo-tunnelgate.net",
      psk: "demo-preshared-key",
      username: "vpnuser",
      password: "demo-password",
    },
    routes: ["192.168.50.0/24"],
    dnsServers: ["192.168.50.1"],
    autoConnect: false,
    connectedSinceHoursAgo: 2.3,
    presentation: {
      iface: "ppp0",
      addr: "192.168.50.24",
      gateway: "172.20.0.7",
      endpoint: "home.demo-tunnelgate.net:1701",
      rxRate: 58_000,
      txRate: 34_000,
    },
  },
  {
    id: "demo-openvpn-sgp",
    name: "APAC - Singapore",
    type: "openvpn",
    config: {
      ovpn: SAMPLE_OVPN.replace("HOST", "ap-sgp-01.demo-tunnelgate.net").replace("PORT", "1194"),
      username: "demo",
      password: "demo",
    },
    routes: ["10.9.0.0/24"],
    dnsServers: ["10.9.0.1"],
    autoConnect: true,
    connectedSinceHoursAgo: 12.7,
    presentation: {
      iface: "tun1",
      addr: "10.9.0.21",
      gateway: "172.20.0.8",
      endpoint: "ap-sgp-01.demo-tunnelgate.net:1194",
      rxRate: 210_000,
      txRate: 90_000,
    },
  },
  {
    id: "demo-netbird-staging",
    name: "NetBird - staging",
    type: "netbird",
    config: {
      mode: "setupkey",
      setupKey: "DEMO-SETUP-KEY-0000-0000",
      hostname: "gateway-staging",
    },
    routes: ["100.92.0.0/24"],
    dnsServers: [],
    autoConnect: true,
    connectedSinceHoursAgo: 48.0,
    presentation: {
      iface: "wt0",
      addr: "100.92.0.5",
      gateway: "172.20.0.9",
      endpoint: "api.netbird.io",
      rxRate: 140_000,
      txRate: 72_000,
    },
  },
];

const DEMO_FORWARDS = [
  {
    id: "demo-fwd-grafana",
    name: "Grafana",
    proto: "tcp",
    listenPort: 40030,
    targetHost: "10.10.0.20",
    targetPort: 3000,
    enabled: true,
  },
  {
    id: "demo-fwd-hass",
    name: "Home Assistant",
    proto: "tcp",
    listenPort: 40031,
    targetHost: "192.168.50.10",
    targetPort: 8123,
    enabled: true,
  },
  {
    id: "demo-fwd-postgres",
    name: "Postgres (read replica)",
    proto: "tcp",
    listenPort: 40032,
    targetHost: "10.8.0.30",
    targetPort: 5432,
    enabled: true,
  },
  {
    id: "demo-fwd-game",
    name: "Game server",
    proto: "udp",
    listenPort: 40033,
    targetHost: "10.10.0.40",
    targetPort: 27015,
    enabled: true,
  },
];

const DEMO_DEVICES = [
  {
    id: "demo-dev-macbook",
    name: "Work MacBook",
    connected: true,
    createdHoursAgo: 240,
  },
  {
    id: "demo-dev-pixel",
    name: "Pixel 8",
    connected: true,
    createdHoursAgo: 120,
  },
  {
    id: "demo-dev-ipad",
    name: "Office iPad",
    connected: false,
    createdHoursAgo: 60,
  },
  {
    id: "demo-dev-laptop",
    name: "Travel laptop",
    connected: false,
    createdHoursAgo: 12,
  },
];

const presentationById = new Map(DEMO_PROFILES.map((seed) => [seed.id, seed.presentation]));
const hoursConnectedById = new Map(DEMO_PROFILES.map((seed) => [seed.id, seed.connectedSinceHoursAgo]));
let profileState: VpnProfile[] | null = null;
let forwardState: PortForward[] | null = null;
let deviceState: OpenVpnDevice[] | null = null;
const connectedCommonNames = new Set(
  DEMO_DEVICES.filter((device) => device.connected).map((device) => `device-${device.id}`),
);

export function demoProfiles(): VpnProfile[] {
  if (!profileState) {
    const now = Math.floor(Date.now() / 1000);
    profileState = DEMO_PROFILES.map((seed, index) => ({
      id: seed.id,
      name: seed.name,
      type: seed.type,
      config: encryptProfileConfig(seed.config),
      routes: JSON.stringify(seed.routes),
      dnsServers: JSON.stringify(seed.dnsServers),
      autoConnect: seed.autoConnect,
      createdAt: now - index * 86_400,
    }));
  }
  return profileState;
}

export function demoProfile(id: string): VpnProfile | undefined {
  return demoProfiles().find((profile) => profile.id === id);
}

export function demoForwards(): PortForward[] {
  if (!forwardState) forwardState = DEMO_FORWARDS.map((forward) => ({ ...forward }));
  return forwardState;
}

export function demoDevices(): OpenVpnDevice[] {
  if (!deviceState) {
    const now = Math.floor(Date.now() / 1000);
    deviceState = DEMO_DEVICES.map((device) => ({
      id: device.id,
      name: device.name,
      commonName: `device-${device.id}`,
      createdAt: now - Math.round(device.createdHoursAgo * 3600),
      revokedAt: null,
    }));
  }
  return deviceState;
}

export function demoConnectedCommonNames(): string[] {
  const present = new Set(demoDevices().map((device) => device.commonName));
  return [...connectedCommonNames].filter((commonName) => present.has(commonName));
}

interface DemoProfileInput {
  name: string;
  type: ProfileType;
  config: Record<string, unknown>;
  routes: string[];
  dnsServers: string[];
}

export function demoCreateProfile(input: DemoProfileInput): { id: string } {
  const id = `demo-${randomUUID().slice(0, 8)}`;
  demoProfiles().unshift({
    id,
    name: input.name,
    type: input.type,
    config: encryptProfileConfig(input.config),
    routes: JSON.stringify(input.routes),
    dnsServers: JSON.stringify(input.dnsServers),
    autoConnect: false,
    createdAt: Math.floor(Date.now() / 1000),
  });
  return { id };
}

export function demoUpdateProfile(id: string, input: DemoProfileInput): boolean {
  const profile = demoProfile(id);
  if (!profile) return false;
  profile.name = input.name;
  profile.type = input.type;
  profile.config = encryptProfileConfig(input.config);
  profile.routes = JSON.stringify(input.routes);
  profile.dnsServers = JSON.stringify(input.dnsServers);
  return true;
}

export function demoSetProfileAutoConnect(id: string, enabled: boolean): boolean {
  const profile = demoProfile(id);
  if (!profile) return false;
  profile.autoConnect = enabled;
  return true;
}

export function demoDeleteProfile(id: string): void {
  const profiles = demoProfiles();
  const index = profiles.findIndex((profile) => profile.id === id);
  if (index >= 0) profiles.splice(index, 1);
}

export function demoCreateForward(input: Omit<PortForward, "id">): {
  id: string;
} {
  const id = `demo-fwd-${randomUUID().slice(0, 8)}`;
  demoForwards().push({ id, ...input });
  return { id };
}

export function demoSetForwardEnabled(id: string, enabled: boolean): boolean {
  const forward = demoForwards().find((item) => item.id === id);
  if (!forward) return false;
  forward.enabled = enabled;
  return true;
}

export function demoForwardEnabled(id: string): boolean {
  return demoForwards().find((item) => item.id === id)?.enabled ?? false;
}

export function demoDeleteForward(id: string): void {
  const forwards = demoForwards();
  const index = forwards.findIndex((item) => item.id === id);
  if (index >= 0) forwards.splice(index, 1);
}

export function demoCreateDevice(name: string): OpenVpnDevice {
  const id = `demo-dev-${randomUUID().slice(0, 8)}`;
  const device: OpenVpnDevice = {
    id,
    name,
    commonName: `device-${id}`,
    createdAt: Math.floor(Date.now() / 1000),
    revokedAt: null,
  };
  demoDevices().push(device);
  return device;
}

export function demoDeleteDevice(id: string): void {
  const devices = demoDevices();
  const index = devices.findIndex((device) => device.id === id);
  if (index >= 0) devices.splice(index, 1);
}

const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const IFACE_PREFIX: Record<ProfileType, string> = {
  openvpn: "tun",
  wireguard: "wg",
  l2tp: "ppp",
  tailscale: "tailscale",
  netbird: "wt",
};

const ENDPOINT_POOL = [
  "us-lax-03.demo-tunnelgate.net:1194",
  "eu-ams-01.demo-tunnelgate.net:1194",
  "ca-tor-02.demo-tunnelgate.net:51820",
  "sa-gru-01.demo-tunnelgate.net:1194",
  "au-syd-01.demo-tunnelgate.net:51820",
];

export function demoConnectionDetails(profile: VpnProfile): DemoPresentation {
  const known = presentationById.get(profile.id);
  if (known) return known;
  const h = hash(profile.id);
  return {
    iface: `${IFACE_PREFIX[profile.type as ProfileType] ?? "tun"}${h % 4}`,
    addr: `10.${20 + (h % 40)}.${(h >> 4) % 200}.${2 + (h % 40)}`,
    gateway: `172.20.0.${10 + (h % 40)}`,
    endpoint: ENDPOINT_POOL[h % ENDPOINT_POOL.length],
    rxRate: 60_000 + (h % 900_000),
    txRate: 20_000 + ((h >> 3) % 300_000),
  };
}

export function demoHoursConnected(profile: VpnProfile): number {
  return hoursConnectedById.get(profile.id) ?? 1;
}

export function demoWorkerUsage(profile: VpnProfile) {
  const h = hash(profile.id);
  const details = demoConnectionDetails(profile);
  const hours = demoHoursConnected(profile);
  const memUsed = (48 + (h % 40)) * 1024 * 1024;
  return {
    cpu: `${(0.4 + (h % 900) / 300).toFixed(2)}%`,
    memory: `${formatBinaryBytes(memUsed)} / ${formatBinaryBytes(256 * 1024 * 1024)}`,
    networkIo: `${formatBinaryBytes(details.rxRate * hours * 3600)} / ${formatBinaryBytes(details.txRate * hours * 3600)}`,
    pids: String(6 + (h % 10)),
  };
}

export function demoDockerDaemon(containersRunning: number) {
  return {
    version: "27.3.1",
    operatingSystem: "Debian GNU/Linux 12 (bookworm)",
    architecture: "x86_64",
    cpus: 8,
    memoryBytes: 33_567_961_088,
    containersRunning,
  };
}

export function demoDockerController() {
  return {
    id: "d3m0c0ntr0ll",
    image: "tunnel-gate:demo",
    network: "tunnel-gate_default",
  };
}
