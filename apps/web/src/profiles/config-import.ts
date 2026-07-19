import { isCidr, isIPv4, netmaskPrefix } from "../lib/ipv4";

export function parseOpenVpnImport(text: string) {
  const routes = [...text.matchAll(/^\s*route\s+(\S+)(?:\s+(\d+\.\d+\.\d+\.\d+))?/gim)].flatMap((match) => {
    if (match[1].includes("/")) return isCidr(match[1]) ? [match[1]] : [];
    if (!isIPv4(match[1])) return [];
    const prefix = match[2] ? netmaskPrefix(match[2]) : 32;
    return prefix === null ? [] : [`${match[1]}/${prefix}`];
  });
  const dnsServers = [...text.matchAll(/^\s*dhcp-option\s+DNS\s+(\S+)/gim)].map((match) => match[1]).filter(isIPv4);
  const credentials = text.match(/<auth-user-pass>\s*\n([^\r\n]+)\s*\n([^\r\n]+)\s*\n<\/auth-user-pass>/i);
  return {
    routes: [...new Set(routes)],
    dnsServers: [...new Set(dnsServers)],
    credentials: credentials ? { username: credentials[1].trim(), password: credentials[2].trim() } : null,
  };
}

export function parseWireGuardImport(text: string) {
  const routes = [...text.matchAll(/^\s*AllowedIPs\s*=\s*(.+)$/gim)]
    .flatMap((match) => match[1].split(","))
    .map((route) => route.trim())
    .filter((route) => isCidr(route) && route !== "0.0.0.0/0");
  const dnsServers = [...text.matchAll(/^\s*DNS\s*=\s*(.+)$/gim)]
    .flatMap((match) => match[1].split(","))
    .map((server) => server.trim())
    .filter(isIPv4);
  return { routes: [...new Set(routes)], dnsServers: [...new Set(dnsServers)] };
}
