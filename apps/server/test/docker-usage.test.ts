import { describe, expect, test } from "bun:test";
import { containerUsage, formatBinaryBytes } from "../src/vpn/docker-usage";

describe("container usage formatting", () => {
  test("computes CPU percentage from usage deltas", () => {
    const usage = containerUsage({
      cpu_stats: { cpu_usage: { total_usage: 400 }, system_cpu_usage: 10_000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 2_000 },
      memory_stats: { usage: 50 * 1024 * 1024, limit: 1024 * 1024 * 1024, stats: { inactive_file: 10 * 1024 * 1024 } },
      networks: { eth0: { rx_bytes: 2048, tx_bytes: 1024 } },
      pids_stats: { current: 12 },
    });
    expect(usage.cpu).toBe("10.00%");
    expect(usage.memory).toBe("40.0MiB / 1.0GiB");
    expect(usage.networkIo).toBe("2.0KiB / 1.0KiB");
    expect(usage.pids).toBe("12");
  });

  test("degrades gracefully on missing samples", () => {
    expect(containerUsage(null)).toEqual({ cpu: null, memory: null, networkIo: null, pids: null });
    const empty = containerUsage({});
    expect(empty.cpu).toBe("0.00%");
    expect(empty.memory).toBeNull();
    expect(empty.networkIo).toBeNull();
    expect(empty.pids).toBe("0");
  });

  test("formats binary byte sizes", () => {
    expect(formatBinaryBytes(0)).toBe("0B");
    expect(formatBinaryBytes(512)).toBe("512B");
    expect(formatBinaryBytes(1536)).toBe("1.5KiB");
    expect(formatBinaryBytes(3 * 1024 ** 3)).toBe("3.0GiB");
  });
});
