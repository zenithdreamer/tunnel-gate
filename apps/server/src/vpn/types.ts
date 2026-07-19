export type TunnelState = "disconnected" | "connecting" | "connected" | "error";

export interface StartedTunnel {
  iface: string;
  endpoint?: string;
  stop: () => Promise<void>;
}

export type LogFn = (line: string) => void;

export interface OpenVpnConfig {
  ovpn: string;
  username?: string;
  password?: string;
}

export interface WireGuardConfig {
  conf: string;
}

export interface L2tpConfig {
  server: string;
  psk: string;
  username: string;
  password: string;
}

export interface TailscaleConfig {
  mode: "authkey" | "login";
  authKey?: string;
  hostname?: string;
  loginServer?: string;
}

export interface NetBirdConfig {
  mode: "setupkey" | "login";
  setupKey?: string;
  hostname?: string;
  managementUrl?: string;
}
