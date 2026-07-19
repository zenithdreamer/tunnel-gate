import { describe, expect, test } from "bun:test";
import { buildWorkerSpec, identityVolume, WORKER_LABELS } from "../src/vpn/worker-spec";

const context = { controllerId: "controller", instance: "relay/test", image: "tunnel-gate:test", network: "relay-net" };

describe("worker specification", () => {
  test("builds a stable base worker", () => {
    const { name, body } = buildWorkerSpec(context, { id: "profile/id", type: "wireguard" });
    expect(name).toBe("tunnel-gate-relay-test-profile-id");
    expect(body.Image).toBe("tunnel-gate:test");
    expect(body.Cmd).toEqual(["bun", "src/vpn/worker.ts", "/tmp/profile.json"]);
    expect(body.Labels[WORKER_LABELS.managed]).toBe("true");
    expect(body.Labels[WORKER_LABELS.profile]).toBe("profile/id");
    expect(body.HostConfig.NetworkMode).toBe("relay-net");
    expect(body.HostConfig.CapAdd).toEqual(["NET_ADMIN"]);
    expect(body.HostConfig.Devices.map((device) => device.PathOnHost)).toEqual(["/dev/net/tun"]);
    expect(body.HostConfig.Sysctls).toEqual({ "net.ipv4.ip_forward": "1" });
    expect(body.HostConfig.Mounts).toEqual([]);
  });

  test("adds only protocol-specific privileges and storage", () => {
    const l2tp = buildWorkerSpec(context, { id: "p", type: "l2tp" }).body;
    expect(l2tp.HostConfig.Devices.map((device) => device.PathOnHost)).toContain("/dev/ppp");

    const tailscale = buildWorkerSpec(context, { id: "p", type: "tailscale" }).body;
    expect(tailscale.HostConfig.Mounts[0]?.Target).toBe("/var/lib/tunnel-gate-worker");
    expect(tailscale.HostConfig.CapAdd).not.toContain("SYS_ADMIN");

    const netbird = buildWorkerSpec(context, { id: "p", type: "netbird" }).body;
    expect(netbird.HostConfig.CapAdd).toContain("SYS_ADMIN");
    expect(netbird.HostConfig.CapAdd).toContain("SYS_RESOURCE");
    expect(netbird.HostConfig.Mounts[0]?.Target).toBe("/var/lib/netbird");
  });

  test("sanitizes identity volume names", () => {
    expect(identityVolume(context, "profile/id", "nb")).toBe("tunnel-gate-nb-relay-test-profile-id");
  });
});
