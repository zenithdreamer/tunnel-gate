import { describe, expect, test } from "bun:test";
import type { PortForward } from "../src/db";
import { ForwardManager, type ForwardManagerDependencies } from "../src/relay/forwards";
import type { ForwardHandle } from "../src/relay/port-forward";

function fakeHandle(onStop: () => void = () => {}): ForwardHandle {
  return { stop: async () => onStop() };
}

function row(overrides: Partial<PortForward> = {}): PortForward {
  return {
    id: "eligible",
    name: "Eligible",
    proto: "tcp",
    listenPort: 8080,
    targetHost: "10.20.0.5",
    targetPort: 80,
    enabled: true,
    ...overrides,
  };
}

function dependencies(overrides: Partial<ForwardManagerDependencies> = {}): ForwardManagerDependencies {
  return {
    listRows: async () => [],
    forwardingRoutes: () => [],
    startForward: () => fakeHandle(),
    log: () => {},
    ...overrides,
  };
}

describe("ForwardManager", () => {
  test("runs only enabled forwards covered by an active route and reports status", async () => {
    const started: { id: string; onExit: (code: number) => void }[] = [];
    const rows = [
      row(),
      row({ id: "disabled", name: "Disabled", listenPort: 8081, enabled: false }),
      row({ id: "outside", name: "Outside", listenPort: 8082, targetHost: "10.30.0.5" }),
    ];
    const manager = new ForwardManager(
      dependencies({
        listRows: async () => rows,
        forwardingRoutes: () => [{ routes: ["10.20.0.0/24"] }],
        startForward: (f, _onLog, onExit) => {
          started.push({ id: f.id, onExit });
          return fakeHandle();
        },
      }),
    );

    await manager.syncForwards();

    expect(started).toHaveLength(1);
    expect(started[0].id).toBe("eligible");
    expect(manager.forwardStatus("eligible")).toBeTrue();
    expect(manager.forwardStatus("disabled")).toBeFalse();

    started[0].onExit(0);
    expect(manager.forwardStatus("eligible")).toBeFalse();
  });

  test("coalesces concurrent syncs so a forward is started once", async () => {
    let releaseRows!: (rows: PortForward[]) => void;
    const rowsPending = new Promise<PortForward[]>((resolve) => {
      releaseRows = resolve;
    });
    let listCalls = 0;
    let startCalls = 0;
    const manager = new ForwardManager(
      dependencies({
        listRows: () => {
          listCalls++;
          return rowsPending;
        },
        forwardingRoutes: () => [{ routes: ["10.20.0.0/24"] }],
        startForward: () => {
          startCalls++;
          return fakeHandle();
        },
      }),
    );

    const first = manager.syncForwards();
    const second = manager.syncForwards();
    expect(second).toBe(first);
    releaseRows([row()]);
    await Promise.all([first, second]);

    expect(listCalls).toBe(2);
    expect(startCalls).toBe(1);
    expect(manager.forwardStatus("eligible")).toBeTrue();
  });
});
