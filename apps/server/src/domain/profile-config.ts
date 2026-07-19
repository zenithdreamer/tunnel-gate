import type { L2tpConfig, NetBirdConfig, OpenVpnConfig, TailscaleConfig, WireGuardConfig } from "../vpn/types";

export const PROFILE_TYPES = ["openvpn", "wireguard", "l2tp", "tailscale", "netbird"] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];
export type ProfileConfig = OpenVpnConfig | WireGuardConfig | L2tpConfig | TailscaleConfig | NetBirdConfig;

const SECRET_KEYS: Record<ProfileType, readonly string[]> = {
  openvpn: ["password"],
  wireguard: [],
  l2tp: ["psk", "password"],
  tailscale: ["authKey"],
  netbird: ["setupKey"],
};

export class ProfileConfigError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProfileConfigError("Profile configuration must be an object");
  return value as Record<string, unknown>;
}

function requiredString(config: Record<string, unknown>, key: string, label: string) {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) throw new ProfileConfigError(`${label} is required`);
  return value;
}

function optionalString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateHostname(hostname: string | undefined, protocol: string) {
  if (hostname && !/^[a-zA-Z0-9-]{1,63}$/.test(hostname)) throw new ProfileConfigError(`Invalid ${protocol} hostname`);
}

function validateUrl(url: string | undefined, label: string) {
  if (url && !/^https?:\/\/[^\s]+$/.test(url)) throw new ProfileConfigError(`Invalid ${label}`);
}

export function parseProfileConfig(type: ProfileType, value: unknown): ProfileConfig {
  const config = record(value);
  if (type === "openvpn") {
    const ovpn = requiredString(config, "ovpn", "OpenVPN configuration");
    const username = optionalString(config, "username");
    const password = optionalString(config, "password");
    if (username && !password)
      throw new ProfileConfigError("OpenVPN password is required when a username is configured");
    return { ovpn, ...(username ? { username, password } : {}) };
  }
  if (type === "wireguard") return { conf: requiredString(config, "conf", "WireGuard configuration") };
  if (type === "l2tp") {
    return {
      server: requiredString(config, "server", "L2TP server").trim(),
      psk: requiredString(config, "psk", "L2TP pre-shared key"),
      username: requiredString(config, "username", "L2TP username"),
      password: requiredString(config, "password", "L2TP password"),
    };
  }
  if (type === "tailscale") {
    const mode = config.mode;
    if (mode !== "authkey" && mode !== "login") throw new ProfileConfigError("Invalid Tailscale enrollment mode");
    const authKey = optionalString(config, "authKey");
    if (mode === "authkey" && !authKey) throw new ProfileConfigError("Tailscale auth key is required");
    const hostname = optionalString(config, "hostname");
    const loginServer = optionalString(config, "loginServer");
    validateHostname(hostname, "Tailscale");
    validateUrl(loginServer, "Tailscale control server URL");
    return {
      mode,
      ...(authKey ? { authKey } : {}),
      ...(hostname ? { hostname } : {}),
      ...(loginServer ? { loginServer } : {}),
    };
  }

  const mode = config.mode;
  if (mode !== "setupkey" && mode !== "login") throw new ProfileConfigError("Invalid NetBird enrollment mode");
  const setupKey = optionalString(config, "setupKey");
  if (mode === "setupkey" && !setupKey) throw new ProfileConfigError("NetBird setup key is required");
  const hostname = optionalString(config, "hostname");
  const managementUrl = optionalString(config, "managementUrl");
  validateHostname(hostname, "NetBird");
  validateUrl(managementUrl, "NetBird management URL");
  return {
    mode,
    ...(setupKey ? { setupKey } : {}),
    ...(hostname ? { hostname } : {}),
    ...(managementUrl ? { managementUrl } : {}),
  };
}

export function preserveProfileSecrets(
  type: ProfileType,
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
) {
  const merged = { ...next };
  for (const key of SECRET_KEYS[type]) if (merged[key] === "" && previous[key]) merged[key] = previous[key];
  return merged;
}

export function redactProfileSecrets(config: Record<string, unknown>) {
  const redacted = { ...config };
  for (const key of new Set(Object.values(SECRET_KEYS).flat())) if (key in redacted) redacted[key] = "";
  return redacted;
}

export function profileSummary(type: ProfileType, config: Record<string, unknown>) {
  if (type === "l2tp") return `${config.server} as ${config.username}`;
  if (type === "tailscale") return String(config.hostname || "Tailscale node");
  if (type === "netbird") return String(config.hostname || "NetBird peer");
  if (type === "openvpn") return config.username ? `User ${config.username}` : "Certificate auth";
  return "WireGuard config";
}
