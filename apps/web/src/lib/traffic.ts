import type { Sample } from "../api";

export interface TrafficPoint {
  t: number;
  rx: number;
  tx: number;
}

export function trafficSourceIds(samples: Sample[], activeIds: string[]): string[] {
  const ids = new Set<string>();
  for (const sample of samples) for (const id of Object.keys(sample.by ?? {})) ids.add(id);
  for (const id of activeIds) ids.add(id);
  return [...ids];
}

export function projectSamples(samples: Sample[], profileId: string): TrafficPoint[] {
  return samples.map((sample) => ({
    t: sample.t,
    rx: sample.by?.[profileId]?.rx ?? 0,
    tx: sample.by?.[profileId]?.tx ?? 0,
  }));
}
