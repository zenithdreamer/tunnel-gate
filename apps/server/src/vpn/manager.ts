import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma, type VpnProfile } from "../db";
import type { ProfileConfig } from "../domain/profile-config";
import { parseJsonList, workerRoutes } from "../domain/profile-routes";
import { errorMessage } from "../lib/errors";
import { decryptProfileConfig } from "../profile-crypto";
import {
  containerStats,
  createContainer,
  dockerInfo,
  followContainerLogs,
  inspectContainer,
  listContainers,
  putArchive,
  removeContainer,
  removeVolume,
  startContainer,
} from "./docker";
import { tarSingleFile } from "./docker-tar";
import { containerUsage } from "./docker-usage";
import { sh } from "./net";
import type { TunnelState } from "./types";
import { buildWorkerSpec, identityVolume, WORKER_LABELS } from "./worker-spec";
import { isCredentialRejection, parseWorkerStatusLine, type WorkerStatusEvent } from "./worker-status";

const LOG_LIMIT = 500;
const ROUTE_PROTO = "186";
const CONNECT_TIMEOUT_MS = 75_000;
const RECONNECT_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 120_000;
const RECONNECT_ATTEMPTS = 5;

interface Session {
  profile: VpnProfile;
  state: TunnelState;
  containerId: string | null;
  gateway: string | null;
  iface: string | null;
  addr: string | null;
  since: number | null;
  lastError: string | null;
  endpoint: string | null;
  loginUrl: string | null;
  routes: string[];
  installedRoutes: string[];
  rx: number;
  tx: number;
  busy: boolean;
  cancelRequested: boolean;
  operationDone: Promise<void>;
  finishOperation: () => void;
  logs: AbortController | null;
  ready?: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
}

interface DockerContext {
  controllerId: string;
  instance: string;
  image: string;
  network: string;
}

export class TunnelManager {
  private sessions = new Map<string, Session>();
  private epochs = new Map<string, number>();
  private reconnecting = new Set<string>();
  private logs: { t: number; line: string; profileId: string | null }[] = [];
  private dockerContext: DockerContext | null = null;
  private topologyListeners = new Set<() => Promise<void>>();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  log = (line: string, profileId: string | null = null) => {
    this.logs.push({ t: Date.now(), line, profileId });
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
  };

  getLogs(after = 0) {
    return this.logs.filter((line) => line.t > after);
  }

  clearLogs() {
    this.logs = [];
  }

  onTopologyChange(listener: () => Promise<void>) {
    this.topologyListeners.add(listener);
    return () => this.topologyListeners.delete(listener);
  }

  private async topologyChanged() {
    const results = await Promise.allSettled([...this.topologyListeners].map((listener) => listener()));
    for (const result of results)
      if (result.status === "rejected") this.log(`topology reconciliation failed: ${result.reason}`);
  }

  trafficCounters() {
    return [...this.sessions.values()]
      .filter((session) => session.state === "connected")
      .map((session) => ({ profileId: session.profile.id, rx: session.rx, tx: session.tx }));
  }

  ifaces() {
    return [...this.sessions.values()]
      .filter((session) => session.state === "connected" && session.iface)
      .map((session) => session.iface!);
  }

  forwardingRoutes() {
    return [...this.sessions.values()]
      .filter((session) => session.state === "connected" && session.gateway)
      .map((session) => ({ profileId: session.profile.id, gateway: session.gateway!, routes: session.routes }));
  }

  isActive(profileId: string) {
    const session = this.sessions.get(profileId);
    return !!session && (session.state === "connected" || session.state === "connecting");
  }

  async initialize() {
    const context = await this.context();
    const [owned, legacy, allManaged] = await Promise.all([
      listContainers([`${WORKER_LABELS.managed}=true`, `${WORKER_LABELS.instance}=${context.instance}`]),
      listContainers([`${WORKER_LABELS.managed}=true`, `${WORKER_LABELS.controller}=${context.controllerId}`]),
      listContainers([`${WORKER_LABELS.managed}=true`]),
    ]);
    const staleIds = new Set([...owned, ...legacy].map((container) => container.Id));
    for (const container of allManaged) {
      if (staleIds.has(container.Id)) continue;
      const ownerId = container.Labels[WORKER_LABELS.controller];
      const owner = ownerId ? await inspectContainer(ownerId) : null;
      if (!owner?.State.Running) staleIds.add(container.Id);
    }
    for (const id of staleIds) await removeContainer(id);
    await sh("ip", ["route", "flush", "proto", ROUTE_PROTO]);
    this.log(`tunnel workers use image ${context.image} on network ${context.network}`);
  }

  async connect(profile: VpnProfile) {
    this.epochs.set(profile.id, (this.epochs.get(profile.id) ?? 0) + 1);
    return this.dial(profile);
  }

  private async context(): Promise<DockerContext> {
    if (this.dockerContext) return this.dockerContext;
    const self = process.env.HOSTNAME ?? readFileSync("/etc/hostname", "utf8").trim();
    if (!self) throw new Error("cannot identify the controller container");
    const info = await inspectContainer(self);
    if (!info) throw new Error(`controller container ${self} was not found via the Docker API`);
    const networks = info.NetworkSettings.Networks ?? {};
    const network = process.env.VPN_WORKER_NETWORK ?? Object.keys(networks)[0];
    if (!network) throw new Error("controller is not attached to a Docker network");
    if (!networks[network]) throw new Error(`controller is not attached to VPN_WORKER_NETWORK ${network}`);
    this.dockerContext = {
      controllerId: info.Id,
      instance: process.env.TUNNEL_GATE_INSTANCE ?? info.Name.replace(/^\//, ""),
      image: process.env.TUNNEL_GATE_WORKER_IMAGE || info.Config.Image || info.Image,
      network,
    };
    return this.dockerContext;
  }

  private async dial(profile: VpnProfile) {
    const existing = this.sessions.get(profile.id);
    if (existing?.busy) throw new Error("tunnel operation already in progress");
    if (this.isActive(profile.id)) throw new Error("This profile is already connected");

    let finishOperation!: () => void;
    const operationDone = new Promise<void>((resolve) => {
      finishOperation = resolve;
    });
    const session: Session = {
      profile,
      state: "connecting",
      containerId: null,
      gateway: null,
      iface: null,
      addr: null,
      since: null,
      lastError: null,
      endpoint: null,
      loginUrl: null,
      routes: workerRoutes(parseJsonList(profile.routes), parseJsonList(profile.dnsServers)),
      installedRoutes: [],
      rx: 0,
      tx: 0,
      busy: true,
      cancelRequested: false,
      operationDone,
      finishOperation,
      logs: null,
    };
    this.sessions.set(profile.id, session);
    this.log(`--- starting isolated worker for "${profile.name}" (${profile.type}) ---`, profile.id);

    try {
      const context = await this.context();
      this.throwIfCancelled(session);
      const { name, body } = buildWorkerSpec(context, profile);
      const config = decryptProfileConfig(profile.config) as ProfileConfig;
      await removeContainer(name);
      session.containerId = await createContainer(name, body);
      this.throwIfCancelled(session);
      const payload = JSON.stringify({
        id: profile.id,
        name: profile.name,
        type: profile.type,
        config,
        routes: session.routes,
        dnsServers: parseJsonList(profile.dnsServers),
      });
      await putArchive(session.containerId, "/tmp", await tarSingleFile("profile.json", payload));
      this.throwIfCancelled(session);
      await startContainer(session.containerId);
      this.throwIfCancelled(session);

      this.followLogs(session);
      await new Promise<void>((resolve, reject) => {
        const interactiveLogin = "mode" in config && config.mode === "login";
        const timeout = interactiveLogin ? 10 * 60_000 : profile.type === "l2tp" ? 150_000 : CONNECT_TIMEOUT_MS;
        const timer = setTimeout(() => {
          session.ready = undefined;
          reject(new Error("VPN worker timed out while connecting"));
        }, timeout);
        session.ready = { resolve, reject, timer };
      });
      this.throwIfCancelled(session);
      const inspected = await inspectContainer(session.containerId);
      const gateway = inspected?.NetworkSettings.Networks?.[context.network]?.IPAddress;
      if (!gateway) throw new Error("could not determine VPN worker address");
      session.gateway = gateway;
      for (const route of session.routes) {
        const result = await sh("ip", ["route", "add", route, "via", session.gateway, "proto", ROUTE_PROTO]);
        if (!result.ok) throw new Error(`failed to route ${route} through worker: ${result.out}`);
        session.installedRoutes.push(route);
      }
      session.state = "connected";
      session.since = Date.now();
      await this.topologyChanged();
      this.log(`--- connected through worker ${session.gateway} ---`, profile.id);
    } catch (error) {
      if (session.gateway)
        for (const route of session.installedRoutes.reverse())
          await sh("ip", ["route", "del", route, "via", session.gateway, "proto", ROUTE_PROTO]);
      session.installedRoutes = [];
      session.state = "error";
      session.lastError = errorMessage(error);
      session.ready = undefined;
      session.logs?.abort();
      if (session.containerId) await removeContainer(session.containerId);
      if (session.cancelRequested) {
        this.sessions.delete(profile.id);
        this.log("--- disconnected while connecting ---", profile.id);
      } else {
        this.log(`--- connect failed: ${errorMessage(error)} ---`, profile.id);
      }
      throw error;
    } finally {
      session.busy = false;
      session.finishOperation();
    }
  }

  private throwIfCancelled(session: Session) {
    if (session.cancelRequested) throw new Error("Tunnel connection cancelled");
  }

  private followLogs(session: Session) {
    if (!session.containerId) return;
    const controller = new AbortController();
    session.logs = controller;
    void followContainerLogs(
      session.containerId,
      (line) => {
        const parsed = parseWorkerStatusLine(line);
        if (parsed.kind === "log") this.log(line, session.profile.id);
        else if (parsed.kind === "invalid") this.log(`invalid worker status: ${line}`, session.profile.id);
        else this.applyWorkerEvent(session, parsed.event);
      },
      controller.signal,
    ).catch(() => {});
  }

  private applyWorkerEvent(session: Session, event: WorkerStatusEvent) {
    if (event.state === "connected") {
      session.iface = event.iface;
      session.addr = event.addr;
      session.endpoint = event.endpoint;
      session.loginUrl = null;
      if (session.ready) clearTimeout(session.ready.timer);
      session.ready?.resolve();
      session.ready = undefined;
    } else if (event.state === "stats") {
      session.rx = event.rx;
      session.tx = event.tx;
    } else if (event.state === "login") {
      session.loginUrl = event.url;
    } else if (event.state === "error") {
      session.lastError = event.error;
      if (session.ready) clearTimeout(session.ready.timer);
      session.ready?.reject(new Error(event.error));
      session.ready = undefined;
    }
  }

  async disconnect(profileId: string) {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error("This profile is not connected");
    this.epochs.set(profileId, (this.epochs.get(profileId) ?? 0) + 1);
    if (session.busy && session.state === "connecting") {
      session.cancelRequested = true;
      if (session.ready) {
        clearTimeout(session.ready.timer);
        session.ready.reject(new Error("Tunnel connection cancelled"));
        session.ready = undefined;
      }
      await session.operationDone;
      return;
    }
    await this.teardown(session);
  }

  setAutoConnect(profileId: string, enabled: boolean) {
    if (!enabled) this.epochs.set(profileId, (this.epochs.get(profileId) ?? 0) + 1);
  }

  async forget(profileId: string) {
    const session = this.sessions.get(profileId);
    if (session && !this.isActive(profileId)) this.sessions.delete(profileId);
    this.epochs.set(profileId, (this.epochs.get(profileId) ?? 0) + 1);
    const context = await this.context();
    await Promise.all([
      removeVolume(identityVolume(context, profileId, "ts")),
      removeVolume(identityVolume(context, profileId, "nb")),
    ]);
  }

  private async teardown(session: Session) {
    if (session.busy) throw new Error("tunnel operation already in progress");
    session.busy = true;
    try {
      if (session.ready) clearTimeout(session.ready.timer);
      session.state = "disconnected";
      await this.topologyChanged();
      if (session.gateway)
        for (const route of session.installedRoutes)
          await sh("ip", ["route", "del", route, "via", session.gateway, "proto", ROUTE_PROTO]);
      session.logs?.abort();
      if (session.containerId) await removeContainer(session.containerId);
      this.log("--- disconnected ---", session.profile.id);
    } finally {
      this.sessions.delete(session.profile.id);
    }
  }

  startWatchdog() {
    if (this.watchdogTimer) return;
    let ticking = false;
    this.watchdogTimer = setInterval(async () => {
      if (ticking) return;
      ticking = true;
      try {
        await this.watchdogTick();
      } finally {
        ticking = false;
      }
    }, 5000);
  }

  private async watchdogTick() {
    for (const session of [...this.sessions.values()]) {
      if (session.state !== "connected" || !session.containerId || this.reconnecting.has(session.profile.id)) continue;
      const info = await inspectContainer(session.containerId).catch(() => null);
      if (info?.State.Running) continue;
      this.log("--- VPN worker stopped ---", session.profile.id);
      try {
        await this.teardown(session);
      } catch {}
      void this.redialLoop(session.profile.id, "reconnect");
    }
  }

  async autoConnect(profileId?: string) {
    const profiles = await prisma.vpnProfile.findMany({
      where: profileId ? { id: profileId, autoConnect: true } : { autoConnect: true },
    });
    await Promise.all(
      profiles.map((profile) => {
        if (this.isActive(profile.id)) return Promise.resolve();
        this.log(`--- auto-connecting "${profile.name}" ---`, profile.id);
        return this.redialLoop(profile.id, "auto-connect");
      }),
    );
  }

  private async redialLoop(profileId: string, reason: string) {
    if (this.reconnecting.has(profileId)) return;
    this.reconnecting.add(profileId);
    const epoch = this.epochs.get(profileId) ?? 0;
    let delay = RECONNECT_DELAY_MS;
    try {
      for (let attempt = 1; ; attempt++) {
        if ((this.epochs.get(profileId) ?? 0) !== epoch || this.isActive(profileId)) return;
        const profile = await prisma.vpnProfile.findUnique({ where: { id: profileId } });
        if (!profile) return;
        if (!profile.autoConnect && attempt > RECONNECT_ATTEMPTS)
          return this.log(`--- ${reason} failed, giving up ---`, profileId);
        try {
          await this.dial(profile);
          return;
        } catch (error) {
          if (isCredentialRejection(errorMessage(error))) {
            this.log(`--- ${reason} stopped: credentials were rejected ---`, profileId);
            return;
          }
          await sleep(delay);
          delay = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS);
        }
      }
    } finally {
      this.reconnecting.delete(profileId);
    }
  }

  status() {
    return {
      tunnels: [...this.sessions.values()].map((session) => ({
        profileId: session.profile.id,
        profileName: session.profile.name,
        type: session.profile.type,
        state: session.state,
        iface: session.iface,
        addr: session.addr,
        since: session.since,
        lastError: session.lastError,
        routes: session.routes,
        endpoint: session.endpoint,
        loginUrl: session.loginUrl,
      })),
    };
  }

  async systemStatus() {
    const context = await this.context();
    const [daemon, containers] = await Promise.all([
      dockerInfo().catch(() => null),
      listContainers([`${WORKER_LABELS.managed}=true`, `${WORKER_LABELS.controller}=${context.controllerId}`]).catch(
        () => [],
      ),
    ]);
    const stats = new Map(
      await Promise.all(
        containers.map(
          async (container) => [container.Id, containerUsage(await containerStats(container.Id))] as const,
        ),
      ),
    );

    return {
      daemon: daemon
        ? {
            version: daemon.ServerVersion,
            operatingSystem: daemon.OperatingSystem,
            architecture: daemon.Architecture,
            cpus: daemon.NCPU,
            memoryBytes: daemon.MemTotal,
            containersRunning: daemon.ContainersRunning,
          }
        : null,
      controller: {
        id: context.controllerId.slice(0, 12),
        image: context.image,
        network: context.network,
      },
      workers: [...this.sessions.values()].map((session) => {
        const containerId = session.containerId;
        const container = containerId
          ? containers.find((item) => item.Id === containerId || item.Id.startsWith(containerId))
          : null;
        const usage = container ? stats.get(container.Id) : null;
        return {
          profileId: session.profile.id,
          profileName: session.profile.name,
          type: session.profile.type,
          state: session.state,
          containerId: session.containerId?.slice(0, 12) ?? null,
          containerName: container?.Names[0]?.replace(/^\//, "") ?? null,
          containerStatus: container?.Status ?? (session.containerId ? "unavailable" : null),
          gateway: session.gateway,
          iface: session.iface,
          address: session.addr,
          error: session.lastError,
          cpu: usage?.cpu ?? null,
          memory: usage?.memory ?? null,
          networkIo: usage?.networkIo ?? null,
          pids: usage?.pids ?? null,
        };
      }),
    };
  }

  async shutdown() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    for (const session of [...this.sessions.values()]) {
      if (!session.busy || session.state !== "connecting") continue;
      session.cancelRequested = true;
      if (session.ready) {
        clearTimeout(session.ready.timer);
        session.ready.reject(new Error("Tunnel connection cancelled during shutdown"));
        session.ready = undefined;
      }
    }
    await Promise.all(
      [...this.sessions.values()].filter((session) => session.busy).map((session) => session.operationDone),
    );
    for (const session of [...this.sessions.values()]) {
      await this.teardown(session).catch(() => {});
    }
  }
}

export const tunnel = new TunnelManager();
