export interface ContainerStatsResponse {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: { inactive_file?: number };
  };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  pids_stats?: { current?: number };
}

export interface ContainerUsage {
  cpu: string | null;
  memory: string | null;
  networkIo: string | null;
  pids: string | null;
}

export function formatBinaryBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)}${units[unit]}`;
}

export function containerUsage(stats: ContainerStatsResponse | null): ContainerUsage {
  if (!stats) return { cpu: null, memory: null, networkIo: null, pids: null };

  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
  const onlineCpus = stats.cpu_stats?.online_cpus || 1;
  const cpu =
    systemDelta > 0 && cpuDelta >= 0 ? `${((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(2)}%` : "0.00%";

  const memoryUsed = Math.max(0, (stats.memory_stats?.usage ?? 0) - (stats.memory_stats?.stats?.inactive_file ?? 0));
  const memoryLimit = stats.memory_stats?.limit ?? 0;
  const memory = memoryLimit ? `${formatBinaryBytes(memoryUsed)} / ${formatBinaryBytes(memoryLimit)}` : null;

  const networks = Object.values(stats.networks ?? {});
  const rx = networks.reduce((sum, network) => sum + (network.rx_bytes ?? 0), 0);
  const tx = networks.reduce((sum, network) => sum + (network.tx_bytes ?? 0), 0);
  const networkIo = networks.length ? `${formatBinaryBytes(rx)} / ${formatBinaryBytes(tx)}` : null;

  return { cpu, memory, networkIo, pids: String(stats.pids_stats?.current ?? 0) };
}
