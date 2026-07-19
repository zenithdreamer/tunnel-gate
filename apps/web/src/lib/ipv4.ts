function ipv4Value(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isIPv4(value: string): boolean {
  return ipv4Value(value) !== null;
}

export function netmaskPrefix(netmask: string): number | null {
  const value = ipv4Value(netmask);
  if (value === null) return null;
  const bits = value.toString(2).padStart(32, "0");
  return /^1*0*$/.test(bits) ? 32 - (bits.match(/0*$/)?.[0].length ?? 0) : null;
}

export function isCidr(value: string): boolean {
  const match = value.match(/^(.+)\/(\d|[12]\d|3[0-2])$/);
  return !!match && isIPv4(match[1]);
}

export function inCidr(ip: string, cidr: string): boolean {
  const [network, bitsText] = cidr.split("/");
  const address = ipv4Value(ip);
  const base = ipv4Value(network);
  const bits = bitsText === undefined ? 32 : Number(bitsText);
  if (address === null || base === null || Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (address & mask) >>> 0 === (base & mask) >>> 0;
}
