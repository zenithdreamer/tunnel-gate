export interface WorkerSpecContext {
  controllerId: string;
  instance: string;
  image: string;
  network: string;
}

export interface WorkerSpecProfile {
  id: string;
  type: string;
}

export const WORKER_LABELS = {
  managed: "com.tunnel-gate.managed",
  controller: "com.tunnel-gate.controller",
  instance: "com.tunnel-gate.instance",
  profile: "com.tunnel-gate.profile",
} as const;

export const WORKER_PROFILE_PATH = "/tmp/profile.json";

interface DeviceMapping {
  PathOnHost: string;
  PathInContainer: string;
  CgroupPermissions: string;
}

interface VolumeMount {
  Type: "volume";
  Source: string;
  Target: string;
}

export interface WorkerCreateBody {
  Image: string;
  Cmd: string[];
  WorkingDir: string;
  Env: string[];
  Labels: Record<string, string>;
  HostConfig: {
    NetworkMode: string;
    CapAdd: string[];
    Devices: DeviceMapping[];
    Sysctls: Record<string, string>;
    LogConfig: { Type: string; Config: Record<string, string> };
    Mounts: VolumeMount[];
  };
}

function safeName(value: string, length: number) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, length);
}

function device(path: string): DeviceMapping {
  return { PathOnHost: path, PathInContainer: path, CgroupPermissions: "rwm" };
}

export function identityVolume(context: WorkerSpecContext, profileId: string, protocol: "ts" | "nb") {
  return `tunnel-gate-${protocol}-${safeName(context.instance, 24)}-${safeName(profileId, 32)}`;
}

export function buildWorkerSpec(
  context: WorkerSpecContext,
  profile: WorkerSpecProfile,
): { name: string; body: WorkerCreateBody } {
  const name = `tunnel-gate-${safeName(context.instance, 24)}-${safeName(profile.id, 28)}`;
  const capAdd = ["NET_ADMIN"];
  const devices = [device("/dev/net/tun")];
  const mounts: VolumeMount[] = [];

  if (profile.type === "l2tp") devices.push(device("/dev/ppp"));
  if (profile.type === "tailscale")
    mounts.push({
      Type: "volume",
      Source: identityVolume(context, profile.id, "ts"),
      Target: "/var/lib/tunnel-gate-worker",
    });
  if (profile.type === "netbird") {
    capAdd.push("SYS_ADMIN", "SYS_RESOURCE");
    mounts.push({ Type: "volume", Source: identityVolume(context, profile.id, "nb"), Target: "/var/lib/netbird" });
  }

  return {
    name,
    body: {
      Image: context.image,
      Cmd: ["bun", "src/vpn/worker.ts", WORKER_PROFILE_PATH],
      WorkingDir: "/app/apps/server",
      Env: ["STATE_DIR=/tmp/tunnel-gate"],
      Labels: {
        [WORKER_LABELS.managed]: "true",
        [WORKER_LABELS.controller]: context.controllerId,
        [WORKER_LABELS.instance]: context.instance,
        [WORKER_LABELS.profile]: profile.id,
      },
      HostConfig: {
        NetworkMode: context.network,
        CapAdd: capAdd,
        Devices: devices,
        Sysctls: { "net.ipv4.ip_forward": "1" },
        LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "2" } },
        Mounts: mounts,
      },
    },
  };
}
