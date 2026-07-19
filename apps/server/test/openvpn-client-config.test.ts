import { describe, expect, test } from "bun:test";
import { prepareOpenVpnConfig } from "../src/vpn/openvpn";

describe("OpenVPN client config preparation", () => {
  test("strips auth-user-pass directive lines", () => {
    const out = prepareOpenVpnConfig("client\nauth-user-pass creds.txt\nremote vpn 1194\n", null);
    expect(out).not.toContain("auth-user-pass");
    expect(out).toContain("client\n");
    expect(out).toContain("remote vpn 1194\n");
  });

  test("strips inline <auth-user-pass> blocks so the directive is not declared twice", () => {
    const config = "client\n<auth-user-pass>\nalice\nhunter2\n</auth-user-pass>\nremote vpn 1194\n";
    const out = prepareOpenVpnConfig(config, "/run/creds.txt");
    expect(out).not.toContain("hunter2");
    expect(out.match(/auth-user-pass/g)).toEqual(["auth-user-pass"]);
    expect(out).toContain("auth-user-pass /run/creds.txt\n");
  });

  test("references the credentials file only when one is provided", () => {
    expect(prepareOpenVpnConfig("client\n", "/tmp/c")).toContain("auth-user-pass /tmp/c");
    expect(prepareOpenVpnConfig("client\n", null)).not.toContain("auth-user-pass");
  });

  test("always ends with a newline", () => {
    expect(prepareOpenVpnConfig("client", null).endsWith("\n")).toBe(true);
  });
});
