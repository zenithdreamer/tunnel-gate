import { describe, expect, test } from "bun:test";
import {
  formatWorkerStatus,
  isCredentialRejection,
  parseWorkerStatusLine,
  type WorkerStatusEvent,
} from "../src/vpn/worker-status";

describe("worker status protocol", () => {
  test("round-trips every event shape", () => {
    const events: WorkerStatusEvent[] = [
      { state: "connecting" },
      { state: "connected", iface: "tun0", addr: "10.8.0.2", endpoint: "203.0.113.5" },
      { state: "stats", rx: 100, tx: 200 },
      { state: "login", url: "https://login.tailscale.com/a/abc" },
      { state: "error", error: "boom" },
    ];
    for (const event of events) {
      expect(parseWorkerStatusLine(formatWorkerStatus(event))).toEqual({ kind: "event", event });
    }
  });

  test("classifies non-status and malformed lines", () => {
    expect(parseWorkerStatusLine("plain log output")).toEqual({ kind: "log" });
    expect(parseWorkerStatusLine("TUNNEL_GATE_STATUS not-json")).toEqual({ kind: "invalid" });
    expect(parseWorkerStatusLine('TUNNEL_GATE_STATUS {"state":"bogus"}')).toEqual({ kind: "invalid" });
    expect(parseWorkerStatusLine("TUNNEL_GATE_STATUS null")).toEqual({ kind: "invalid" });
  });

  test("detects credential rejections that must stop reconnect loops", () => {
    expect(isCredentialRejection("openvpn: authentication failed")).toBe(true);
    expect(isCredentialRejection("AUTH_FAILED")).toBe(true);
    expect(isCredentialRejection("L2TP username or password was rejected")).toBe(true);
    expect(isCredentialRejection("connection timed out")).toBe(false);
  });
});
