import { describe, expect, test } from "bun:test";
import { netmaskPrefix } from "../src/lib/ipv4";
import { parseOpenVpnImport, parseWireGuardImport } from "../src/profiles/config-import";
import { commaList } from "../src/profiles/model";

describe("VPN configuration imports", () => {
  test("parses OpenVPN routes, DNS, and inline credentials", () => {
    const result = parseOpenVpnImport(
      `route 10.1.2.3 255.255.0.0\nroute 10.3.0.0/16\ndhcp-option DNS 10.1.0.53\n<auth-user-pass>\r\nuser\r\nsecret\r\n</auth-user-pass>`,
    );
    expect(result.routes).toEqual(["10.1.2.3/16", "10.3.0.0/16"]);
    expect(result.dnsServers).toEqual(["10.1.0.53"]);
    expect(result.credentials).toEqual({ username: "user", password: "secret" });
  });

  test("rejects malformed OpenVPN netmasks and addresses", () => {
    expect(netmaskPrefix("255.0.255.0")).toBeNull();
    expect(parseOpenVpnImport("route 999.1.1.1 255.255.255.0").routes).toEqual([]);
  });

  test("parses WireGuard lists and excludes default and invalid routes", () => {
    const result = parseWireGuardImport("AllowedIPs = 10.0.0.0/8, 0.0.0.0/0, 999.1.0.0/16\nDNS = 10.0.0.53, bad");
    expect(result).toEqual({ routes: ["10.0.0.0/8"], dnsServers: ["10.0.0.53"] });
  });

  test("normalizes comma-separated form fields", () => {
    expect(commaList(" 10.0.0.0/8, ,10.1.0.0/16 ")).toEqual(["10.0.0.0/8", "10.1.0.0/16"]);
  });
});
