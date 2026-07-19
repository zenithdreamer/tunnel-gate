import { Box, Boxes, Cpu, HardDrive, Network, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, type DockerSystemStatus, errorMessage, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { EmptyPanel, ErrorMessage } from "./components/Feedback";
import { StatusBadge } from "./components/StatusBadge";
import { usePoll } from "./hooks/usePoll";
import { formatBytes } from "./lib/format";
import { CARD, SPAN_TWO } from "./lib/ui";

export function System() {
  const [status, setStatus] = useState<DockerSystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh(showBusy = false) {
    if (showBusy) setRefreshing(true);
    try {
      setStatus(await unwrap(api.system.docker.get()));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }

  usePoll(refresh, 5000);

  const connected = status?.workers.filter((worker) => worker.state === "connected").length ?? 0;

  return (
    <>
      <section className={`${CARD} ${SPAN_TWO}`}>
        <CardHeader title="Docker System">
          <button type="button" className="btn small ghost" disabled={refreshing} onClick={() => void refresh(true)}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={13} /> Refresh
          </button>
        </CardHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 flex items-center justify-between text-[var(--ink-3)]">
              <span className="text-xs uppercase tracking-wider">Engine</span>
              <Boxes size={15} />
            </div>
            <strong className="font-[var(--mono)] text-lg">{status?.daemon?.version ?? "..."}</strong>
            <span className="mt-1 block text-xs text-[var(--ink-2)]">
              {status?.daemon?.operatingSystem ?? "Loading"}
            </span>
          </div>
          <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 flex items-center justify-between text-[var(--ink-3)]">
              <span className="text-xs uppercase tracking-wider">VPN Workers</span>
              <Box size={15} />
            </div>
            <strong className="font-[var(--mono)] text-2xl">{status?.workers.length ?? 0}</strong>
            <span className="mt-1 block text-xs text-[var(--ink-2)]">{connected} connected</span>
          </div>
          <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 flex items-center justify-between text-[var(--ink-3)]">
              <span className="text-xs uppercase tracking-wider">Docker CPU</span>
              <Cpu size={15} />
            </div>
            <strong className="font-[var(--mono)] text-2xl">{status?.daemon?.cpus ?? 0}</strong>
            <span className="mt-1 block text-xs text-[var(--ink-2)]">{status?.daemon?.architecture ?? "..."}</span>
          </div>
          <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 flex items-center justify-between text-[var(--ink-3)]">
              <span className="text-xs uppercase tracking-wider">Docker Memory</span>
              <HardDrive size={15} />
            </div>
            <strong className="font-[var(--mono)] text-2xl">{formatBytes(status?.daemon?.memoryBytes ?? 0)}</strong>
            <span className="mt-1 block text-xs text-[var(--ink-2)]">
              {status?.daemon?.containersRunning ?? 0} host containers running
            </span>
          </div>
        </div>
      </section>

      <section className={`${CARD} ${SPAN_TWO}`}>
        <CardHeader title="Controller" />
        <div className="grid gap-3 font-[var(--mono)] text-xs sm:grid-cols-3">
          <div>
            <span className="mb-1 block text-[var(--ink-3)]">CONTAINER</span>
            <strong>{status?.controller.id ?? "..."}</strong>
          </div>
          <div>
            <span className="mb-1 block text-[var(--ink-3)]">IMAGE</span>
            <strong className="break-all">{status?.controller.image ?? "..."}</strong>
          </div>
          <div>
            <span className="mb-1 block text-[var(--ink-3)]">NETWORK</span>
            <strong>{status?.controller.network ?? "..."}</strong>
          </div>
        </div>
      </section>

      {status?.workers.length === 0 && <EmptyPanel>No VPN workers are active.</EmptyPanel>}
      {status?.workers.map((worker) => (
        <section className={CARD} key={worker.profileId}>
          <CardHeader
            title={worker.profileName}
            subtitle={
              <span className="mt-1 block font-[var(--mono)] text-[0.65rem] uppercase tracking-wider text-[var(--ink-3)]">
                {worker.type} worker
              </span>
            }
          >
            <StatusBadge
              className={
                worker.state === "connected"
                  ? "!border-[var(--ok)] !text-[var(--ok)]"
                  : worker.state === "error"
                    ? "!border-[var(--bad)] !text-[var(--bad)]"
                    : ""
              }
            >
              {worker.state}
            </StatusBadge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-[var(--mono)] text-xs">
            <div>
              <span className="block text-[var(--ink-3)]">CONTAINER</span>
              <strong>{worker.containerId ?? "none"}</strong>
            </div>
            <div>
              <span className="block text-[var(--ink-3)]">STATUS</span>
              <strong>{worker.containerStatus ?? "not running"}</strong>
            </div>
            <div>
              <span className="block text-[var(--ink-3)]">GATEWAY</span>
              <strong>{worker.gateway ?? "pending"}</strong>
            </div>
            <div>
              <span className="block text-[var(--ink-3)]">TUNNEL</span>
              <strong>{worker.iface ? `${worker.iface} ${worker.address ?? ""}` : "pending"}</strong>
            </div>
            <div>
              <span className="block text-[var(--ink-3)]">CPU</span>
              <strong>{worker.cpu ?? "-"}</strong>
            </div>
            <div>
              <span className="block text-[var(--ink-3)]">MEMORY</span>
              <strong>{worker.memory ?? "-"}</strong>
            </div>
            <div className="col-span-2">
              <span className="flex items-center gap-1 text-[var(--ink-3)]">
                <Network size={11} /> NETWORK I/O
              </span>
              <strong>{worker.networkIo ?? "-"}</strong>
            </div>
          </div>
          {worker.error && <ErrorMessage className="!mb-0 mt-4">{worker.error}</ErrorMessage>}
        </section>
      ))}
    </>
  );
}
