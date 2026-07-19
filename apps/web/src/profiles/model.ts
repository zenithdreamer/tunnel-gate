import { PROFILE_TYPES, type ProfileType } from "../api";

export { PROFILE_TYPES };

export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  openvpn: "OpenVPN",
  wireguard: "WireGuard",
  l2tp: "L2TP/IPSec",
  tailscale: "Tailscale",
  netbird: "NetBird",
};

export function commaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
