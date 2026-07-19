import { describe, expect, test } from "bun:test";
import { parseProfileConfig, preserveProfileSecrets, redactProfileSecrets } from "../src/domain/profile-config";

describe("profile configuration", () => {
  test("validates all protocol shapes", () => {
    expect(parseProfileConfig("openvpn", { ovpn: "client" })).toEqual({ ovpn: "client" });
    expect(parseProfileConfig("wireguard", { conf: "[Interface]" })).toEqual({ conf: "[Interface]" });
    expect(parseProfileConfig("l2tp", { server: "vpn.test", psk: "p", username: "u", password: "s" })).toEqual({
      server: "vpn.test",
      psk: "p",
      username: "u",
      password: "s",
    });
    expect(parseProfileConfig("tailscale", { mode: "login", hostname: "relay-1" })).toEqual({
      mode: "login",
      hostname: "relay-1",
    });
    expect(parseProfileConfig("netbird", { mode: "setupkey", setupKey: "key" })).toEqual({
      mode: "setupkey",
      setupKey: "key",
    });
  });

  test("rejects missing and invalid enrollment data", () => {
    expect(() => parseProfileConfig("tailscale", { mode: "authkey" })).toThrow("auth key");
    expect(() => parseProfileConfig("netbird", { mode: "setupkey" })).toThrow("setup key");
    expect(() => parseProfileConfig("netbird", { mode: "login", managementUrl: "not-a-url" })).toThrow(
      "management URL",
    );
    expect(() => parseProfileConfig("tailscale", { mode: "login", hostname: "bad_host" })).toThrow("hostname");
  });

  test("preserves and redacts only known secrets", () => {
    expect(preserveProfileSecrets("netbird", { mode: "setupkey", setupKey: "" }, { setupKey: "saved" })).toEqual({
      mode: "setupkey",
      setupKey: "saved",
    });
    expect(redactProfileSecrets({ setupKey: "saved", hostname: "relay" })).toEqual({ setupKey: "", hostname: "relay" });
  });
});
