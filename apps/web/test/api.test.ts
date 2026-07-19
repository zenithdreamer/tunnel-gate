import { describe, expect, test } from "bun:test";
import { errorMessage, unwrap } from "../src/api";
import { fmtRate } from "../src/lib/format";

describe("eden client helpers", () => {
  test("unwrap resolves with data when there is no error", async () => {
    expect(await unwrap(Promise.resolve({ data: { ok: true }, error: null }))).toEqual({ ok: true });
  });

  test("unwrap throws the server error message", async () => {
    const call = Promise.resolve({ data: null, error: { value: { error: "bad request" } } });
    expect(unwrap(call)).rejects.toThrow("bad request");
  });

  test("errorMessage extracts from Error, eden error shape, and fallback", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ value: { error: "server said no" } })).toBe("server said no");
    expect(errorMessage("plain string")).toBe("plain string");
  });

  test("fmtRate", () => {
    expect(fmtRate(999)).toBe("999 B/s");
    expect(fmtRate(1000)).toBe("1.0 kB/s");
    expect(fmtRate(1_000_000)).toBe("1.0 MB/s");
  });
});
