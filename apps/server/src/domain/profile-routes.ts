import { parseIPv4Cidr } from "./network-address";

export function parseJsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function workerRoutes(routes: string[], dnsServers: string[]): string[] {
  return [...new Set([...routes, ...dnsServers.map((server) => `${server}/32`)])];
}

export interface StoredProfileNetwork {
  routes: string;
  dnsServers: string;
}

export function aggregateAdvertisedNetwork(profiles: StoredProfileNetwork[]): {
  routes: string[];
  dnsServers: string[];
} {
  const dnsServers = [...new Set(profiles.flatMap((profile) => parseJsonList(profile.dnsServers)))].sort();
  const routes = profiles.flatMap((profile) => parseJsonList(profile.routes));
  return {
    routes: [
      ...new Set([...routes.filter((route) => parseIPv4Cidr(route)), ...dnsServers.map((server) => `${server}/32`)]),
    ].sort(),
    dnsServers,
  };
}
