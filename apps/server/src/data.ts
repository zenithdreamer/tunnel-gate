import { type OpenVpnDevice, type PortForward, prisma, type VpnProfile } from "./db";
import { DEMO, demoDevices, demoForwards, demoProfile, demoProfiles } from "./demo";

interface DataStore {
  profiles(): Promise<VpnProfile[]>;
  profile(id: string): Promise<VpnProfile | null>;
  forwards(): Promise<PortForward[]>;
  devices(): Promise<OpenVpnDevice[]>;
  device(id: string): Promise<OpenVpnDevice | null>;
}

const prismaStore: DataStore = {
  profiles: () => prisma.vpnProfile.findMany({ orderBy: { createdAt: "desc" } }),
  profile: (id) => prisma.vpnProfile.findUnique({ where: { id } }),
  forwards: () => prisma.portForward.findMany({ orderBy: { listenPort: "asc" } }),
  devices: () => prisma.openVpnDevice.findMany({ orderBy: { createdAt: "desc" } }),
  device: (id) => prisma.openVpnDevice.findUnique({ where: { id } }),
};

const demoStore: DataStore = {
  profiles: async () => demoProfiles(),
  profile: async (id) => demoProfile(id) ?? null,
  forwards: async () => demoForwards(),
  devices: async () => demoDevices(),
  device: async (id) => demoDevices().find((device) => device.id === id) ?? null,
};

export const store: DataStore = DEMO ? demoStore : prismaStore;
