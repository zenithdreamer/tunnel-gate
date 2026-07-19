import { type PortForward, prisma } from "../db";
import { ipv4CidrContains } from "../domain/network-address";
import { CoalescedTask } from "../lib/coalesced-task";
import { tunnel } from "../vpn/manager";
import { type ForwardHandle, startTcpForward, startUdpForward } from "./port-forward";

interface ForwardingRouteSet {
  routes: string[];
}

export interface ForwardManagerDependencies {
  listRows: () => Promise<PortForward[]>;
  forwardingRoutes: () => ForwardingRouteSet[];
  startForward: (f: PortForward, onLog: (line: string) => void, onExit: (code: number) => void) => ForwardHandle;
  log: (line: string) => void;
}

export function forwardPortRange(): { lo: number; hi: number } | null {
  const m = (process.env.FORWARD_PORT_RANGE ?? "").match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2] ?? m[1]);
  return lo >= 1 && hi <= 65535 && lo <= hi ? { lo, hi } : null;
}

interface RunningForward {
  handle: ForwardHandle;
  alive: boolean;
}

export class ForwardManager {
  private readonly running = new Map<string, RunningForward>();
  private readonly reconciliation = new CoalescedTask(() => this.reconcile());

  constructor(private readonly dependencies: ForwardManagerDependencies) {}

  syncForwards(): Promise<void> {
    return this.reconciliation.run();
  }

  forwardStatus(id: string): boolean {
    return this.running.get(id)?.alive ?? false;
  }

  async stop(): Promise<void> {
    const forwards = [...this.running.values()];
    this.running.clear();
    await Promise.all(forwards.map((forward) => forward.handle.stop()));
  }

  private async reconcile(): Promise<void> {
    const rows = await this.dependencies.listRows();
    const routes = this.dependencies.forwardingRoutes().flatMap((session) => session.routes);
    const wanted = new Map(
      rows
        .filter((row) => row.enabled && routes.some((route) => ipv4CidrContains(route, row.targetHost)))
        .map((row) => [row.id, row]),
    );
    await Promise.all(
      [...this.running].flatMap(([id, forward]) =>
        wanted.has(id)
          ? []
          : [
              forward.handle.stop().then(() => {
                if (this.running.get(id) === forward) this.running.delete(id);
              }),
            ],
      ),
    );
    for (const [id, row] of wanted) if (!this.running.has(id)) this.startForward(row);
  }

  private startForward(f: PortForward): void {
    const forward: RunningForward = {
      alive: true,
      handle: this.dependencies.startForward(
        f,
        (line) => this.dependencies.log(`[fwd ${f.name}] ${line}`),
        (code) => {
          forward.alive = false;
          if (this.running.get(f.id) === forward) this.running.delete(f.id);
          if (code)
            this.dependencies.log(`[fwd ${f.name}] exited (code ${code}); is port ${f.listenPort} already in use?`);
        },
      ),
    };
    this.running.set(f.id, forward);
    this.dependencies.log(`[fwd] ${f.name}: :${f.listenPort}/${f.proto} -> ${f.targetHost}:${f.targetPort}`);
  }
}

const forwardManager = new ForwardManager({
  listRows: () => prisma.portForward.findMany(),
  forwardingRoutes: () => tunnel.forwardingRoutes(),
  startForward: (f, onLog, onExit) =>
    f.proto === "tcp"
      ? startTcpForward(f.listenPort, f.targetHost, f.targetPort, onLog, onExit)
      : startUdpForward(f.listenPort, f.targetHost, f.targetPort, onLog, onExit),
  log: (line) => tunnel.log(line),
});

export function syncForwards(): Promise<void> {
  return forwardManager.syncForwards();
}

export function forwardStatus(id: string): boolean {
  return forwardManager.forwardStatus(id);
}

export function stopForwards(): Promise<void> {
  return forwardManager.stop();
}
