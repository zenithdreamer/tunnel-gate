import { describe, expect, test } from "bun:test";
import { TrafficStats } from "../src/stats";

describe("traffic stats buffer", () => {
  test("records rate samples and filters by window", () => {
    const stats = new TrafficStats();
    stats.record([{ profileId: "p", rx: 0, tx: 0 }], 1000);
    stats.record([{ profileId: "p", rx: 2000, tx: 1000 }], 3000);
    stats.record([{ profileId: "p", rx: 4000, tx: 2000 }], 5000);

    const all = stats.getSamples(60_000, 5000);
    expect(all).toHaveLength(3);
    expect(all[1].rx).toBe(1000);
    expect(all[2].by.p).toEqual({ rx: 1000, tx: 500 });

    expect(stats.getSamples(2000, 5000)).toHaveLength(2);
    expect(stats.getSamples(0, 5000)).toHaveLength(1);
  });

  test("caps retained samples at the configured capacity", () => {
    const stats = new TrafficStats(3);
    for (let i = 0; i < 10; i++) stats.record([], i * 1000);
    const samples = stats.getSamples(60_000, 9000);
    expect(samples).toHaveLength(3);
    expect(samples[0].t).toBe(7000);
  });
});
