import { formatIPv4, parseIPv4Cidr, prefixToNetmask } from "../../domain/network-address";

export interface OpenVpnRoute {
  network: string;
  netmask: string;
}

export function cidrRoute(cidr: string): OpenVpnRoute | null {
  const parsed = parseIPv4Cidr(cidr);
  if (!parsed) return null;
  return {
    network: formatIPv4(parsed.network),
    netmask: prefixToNetmask(parsed.prefix)!,
  };
}
