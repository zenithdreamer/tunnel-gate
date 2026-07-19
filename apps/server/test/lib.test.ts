import { describe, expect, test } from "bun:test";
import { isSafeDiagnosticHost } from "../src/domain/network-address";
import { errorMessage } from "../src/lib/errors";

describe("diagnostic host validation", () => {
  test("accepts hostnames and addresses", () => {
    expect(isSafeDiagnosticHost("10.1.2.3")).toBe(true);
    expect(isSafeDiagnosticHost("host.example.com")).toBe(true);
    expect(isSafeDiagnosticHost("::1")).toBe(true);
    expect(isSafeDiagnosticHost("fe80::1")).toBe(true);
  });

  test("rejects values that would be parsed as program options", () => {
    expect(isSafeDiagnosticHost("-c")).toBe(false);
    expect(isSafeDiagnosticHost("-f")).toBe(false);
    expect(isSafeDiagnosticHost("--interface=eth0")).toBe(false);
  });

  test("rejects shell-relevant and malformed input", () => {
    expect(isSafeDiagnosticHost("host,option=1")).toBe(false);
    expect(isSafeDiagnosticHost("host name")).toBe(false);
    expect(isSafeDiagnosticHost("host;id")).toBe(false);
    expect(isSafeDiagnosticHost("a".repeat(256))).toBe(false);
    expect(isSafeDiagnosticHost("")).toBe(false);
  });
});

describe("error message extraction", () => {
  test("handles both Error and non-Error throwables", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("raw string")).toBe("raw string");
    expect(errorMessage(42)).toBe("42");
  });
});
