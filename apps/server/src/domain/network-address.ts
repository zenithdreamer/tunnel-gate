export interface IPv4Cidr {
  address: number;
  network: number;
  prefix: number;
  start: number;
  end: number;
}

export const RELAY_RESERVED_CIDRS = ["10.250.0.0/24"] as const;

export function isSafeDiagnosticHost(host: string): boolean {
  return (
    host.length <= 255 && /^[a-zA-Z0-9._:-]+$/.test(host) && !host.startsWith("-") // A leading "-" would be parsed as a program option by ping/dig, not a hostname.
  );
}

export function parseIPv4(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function formatIPv4(value: number): string {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function parseIPv4Cidr(value: string): IPv4Cidr | null {
  const match = value.match(/^(.+)\/(\d|[12]\d|3[0-2])$/);
  if (!match) return null;
  const address = parseIPv4(match[1]);
  if (address === null) return null;
  const prefix = Number(match[2]);
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  return { address, network, prefix, start: network, end: (network | ~mask) >>> 0 };
}

export function canonicalIPv4Cidr(value: string): string | null {
  const parsed = parseIPv4Cidr(value);
  return parsed ? `${formatIPv4(parsed.network)}/${parsed.prefix}` : null;
}

export function ipv4CidrContains(cidr: string, address: string): boolean {
  const parsedCidr = parseIPv4Cidr(cidr);
  const parsedAddress = parseIPv4(address);
  return (
    parsedCidr !== null &&
    parsedAddress !== null &&
    parsedAddress >= parsedCidr.start &&
    parsedAddress <= parsedCidr.end
  );
}

export function ipv4CidrsOverlap(left: string, right: string): boolean {
  const a = parseIPv4Cidr(left);
  const b = parseIPv4Cidr(right);
  return a !== null && b !== null && a.start <= b.end && b.start <= a.end;
}

export function prefixToNetmask(prefix: number): string | null {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
  return formatIPv4(mask);
}

export function validateAddressPlan(routes: string[], dnsServers: string[]): string | null {
  if (routes.some((route) => !parseIPv4Cidr(route))) return "Routes must be valid IPv4 CIDRs";
  if (routes.some((route) => parseIPv4Cidr(route)?.prefix === 0))
    return "Default routes are not allowed; configure specific VPN CIDRs";
  if (new Set(routes.map(canonicalIPv4Cidr)).size !== routes.length) return "Duplicate VPN routes are not allowed";
  if (dnsServers.some((server) => parseIPv4(server) === null)) return "DNS servers must be valid IPv4 addresses";
  if (new Set(dnsServers).size !== dnsServers.length) return "Duplicate DNS servers are not allowed";

  const allRoutes = [...routes, ...dnsServers.map((server) => `${server}/32`)];
  for (let left = 0; left < allRoutes.length; left++) {
    for (let right = left + 1; right < allRoutes.length; right++) {
      if (ipv4CidrsOverlap(allRoutes[left], allRoutes[right]))
        return "VPN routes and DNS servers within one profile must not overlap";
    }
  }
  for (const route of allRoutes) {
    const reserved = RELAY_RESERVED_CIDRS.find((cidr) => ipv4CidrsOverlap(route, cidr));
    if (reserved) return `Route overlaps with the relay infrastructure network (${reserved})`;
  }
  return null;
}
