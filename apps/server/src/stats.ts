import { tunnel } from "./vpn/manager";

const INTERVAL_MS = 2000;
const CAPACITY = 900;
export const DEFAULT_WINDOW_MS = 5 * 60_000;

export interface Sample {
  t: number;
  rx: number;
  tx: number;
  by: Record<string, { rx: number; tx: number }>;
}

export interface TrafficCounter {
  profileId: string;
  rx: number;
  tx: number;
}

export function calculateTrafficSample(
  counters: TrafficCounter[],
  previous: ReadonlyMap<string, { rx: number; tx: number; t: number }>,
  now: number,
) {
  const next = new Map<string, { rx: number; tx: number; t: number }>();
  let rx = 0;
  let tx = 0;
  const by: Sample["by"] = {};
  for (const counter of counters) {
    const prev = previous.get(counter.profileId);
    const dt = prev ? (now - prev.t) / 1000 : 0;
    if (prev && dt > 0) {
      const rxRate = Math.max(0, (counter.rx - prev.rx) / dt);
      const txRate = Math.max(0, (counter.tx - prev.tx) / dt);
      rx += rxRate;
      tx += txRate;
      by[counter.profileId] = { rx: rxRate, tx: txRate };
    }
    next.set(counter.profileId, { rx: counter.rx, tx: counter.tx, t: now });
  }
  return { sample: { t: now, rx, tx, by } satisfies Sample, next };
}

export class TrafficStats {
  private samples: Sample[] = [];
  private last = new Map<string, { rx: number; tx: number; t: number }>();

  constructor(private readonly capacity = CAPACITY) {}

  record(counters: TrafficCounter[], now = Date.now()): Sample {
    const result = calculateTrafficSample(counters, this.last, now);
    this.last = result.next;
    this.samples.push(result.sample);
    if (this.samples.length > this.capacity) this.samples.splice(0, this.samples.length - this.capacity);
    return result.sample;
  }

  getSamples(windowMs = DEFAULT_WINDOW_MS, now = Date.now()): Sample[] {
    const cutoff = now - windowMs;
    return this.samples.filter((sample) => sample.t >= cutoff);
  }
}

const trafficStats = new TrafficStats();

export function startStatsSampler(): () => void {
  const timer = setInterval(() => trafficStats.record(tunnel.trafficCounters()), INTERVAL_MS);
  return () => clearInterval(timer);
}

export function getSamples(windowMs?: number): Sample[] {
  return trafficStats.getSamples(windowMs);
}
