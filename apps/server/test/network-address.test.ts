import { describe, expect, test } from "bun:test";
import {
  canonicalIPv4Cidr,
  ipv4CidrContains,
  ipv4CidrsOverlap,
  parseIPv4,
  parseIPv4Cidr,
  prefixToNetmask,
  validateAddressPlan,
} from "../src/domain/network-address";

describe("IPv4 network domain", () => {
  test("strictly parses IPv4 addresses", () => {
    expect(parseIPv4("0.0.0.0")).toBe(0);
    expect(parseIPv4("255.255.255.255")).toBe(0xffffffff);
    expect(parseIPv4("1..2.3")).toBeNull();
    expect(parseIPv4("1e2.0.0.1")).toBeNull();
    expect(parseIPv4("256.0.0.1")).toBeNull();
  });

  test("canonicalizes and handles CIDR boundaries", () => {
    expect(canonicalIPv4Cidr("10.1.2.3/8")).toBe("10.0.0.0/8");
    expect(parseIPv4Cidr("10.0.0.1/33")).toBeNull();
    expect(ipv4CidrContains("10.0.0.0/24", "10.0.0.255")).toBeTrue();
    expect(ipv4CidrContains("10.0.0.0/24", "10.0.1.0")).toBeFalse();
    expect(prefixToNetmask(24)).toBe("255.255.255.0");
    expect(prefixToNetmask(0)).toBe("0.0.0.0");
  });

  test("detects overlaps", () => {
    expect(ipv4CidrsOverlap("10.0.0.0/8", "10.1.2.3/32")).toBeTrue();
    expect(ipv4CidrsOverlap("10.0.0.0/24", "10.0.1.0/24")).toBeFalse();
  });

  test("validates a complete profile address plan", () => {
    expect(validateAddressPlan(["10.1.0.0/16"], ["10.2.0.53"])).toBeNull();
    expect(validateAddressPlan(["0.0.0.0/0"], [])).toContain("Default routes");
    expect(validateAddressPlan(["10.1.0.0/16", "10.1.2.0/24"], [])).toContain("must not overlap");
    expect(validateAddressPlan(["10.1.0.0/16"], ["10.1.0.53"])).toBeNull();
    expect(validateAddressPlan(["10.250.0.8/32"], [])).toContain("relay infrastructure");
  });
});
