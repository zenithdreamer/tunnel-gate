import { treaty } from "@elysiajs/eden";
import type { App } from "@tunnel-gate/server/app";

export { PROFILE_TYPES, type ProfileType } from "@tunnel-gate/server/domain/profile-config";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
const client = treaty<App>(origin, { fetch: { credentials: "include" } }).api;

export const api = client;

type EdenResult<T> = Promise<{ data: T | null; error: unknown }>;

export async function unwrap<T>(call: EdenResult<T>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const value = (error as { value?: unknown } | undefined)?.value;
  if (value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  return String(error);
}

type Unwrap<T> = T extends { data: infer D } ? NonNullable<D> : never;

export type Profile = Unwrap<Awaited<ReturnType<typeof client.profiles.get>>>[number];
export type TunnelInfo = Unwrap<Awaited<ReturnType<typeof client.tunnel.status.get>>>["tunnels"][number];
export type TunnelState = TunnelInfo["state"];
export type TunnelStatus = Unwrap<Awaited<ReturnType<typeof client.tunnel.status.get>>>;
export type Forward = Unwrap<Awaited<ReturnType<typeof client.forwards.get>>>[number];
export type Sample = Unwrap<Awaited<ReturnType<typeof client.stats.get>>>["samples"][number];
const openVpnServerApi = client["openvpn-server"];
export type OpenVpnServerStatus = Unwrap<Awaited<ReturnType<typeof openVpnServerApi.status.get>>>;
export type OpenVpnDevice = OpenVpnServerStatus["devices"][number];
export type DockerSystemStatus = Unwrap<Awaited<ReturnType<typeof client.system.docker.get>>>;
