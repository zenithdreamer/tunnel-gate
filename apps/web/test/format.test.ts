import { describe, expect, test } from "bun:test";
import { formatBytes, niceMax } from "../src/lib/format";

describe("display formatting", () => {
  test("formats byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  test("rounds chart maxima to friendly values", () => {
    expect(niceMax(1024)).toBe(2000);
    expect(niceMax(4200)).toBe(5000);
    expect(niceMax(9000)).toBe(10000);
    expect(niceMax(100)).toBe(100);
  });
});
