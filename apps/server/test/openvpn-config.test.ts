import { describe, expect, test } from "bun:test";
import { caConfig } from "../src/relay/openvpn/ca-config";
import { cidrRoute } from "../src/relay/openvpn/cidr-route";
import { serverConfig } from "../src/relay/openvpn/server-config";
import { parseConnectedCommonNames } from "../src/relay/openvpn/status";

describe("OpenVPN pure configuration helpers", () => {
  test("converts CIDRs to canonical OpenVPN routes", () => {
    expect(cidrRoute("10.20.30.40/16")).toEqual({ network: "10.20.0.0", netmask: "255.255.0.0" });
    expect(cidrRoute("0.0.0.0/0")).toEqual({ network: "0.0.0.0", netmask: "0.0.0.0" });
    expect(cidrRoute("not-a-cidr")).toBeNull();
  });

  test("generates a CA config rooted at the supplied directory", () => {
    const config = caConfig("/state/openvpn");

    expect(config).toContain("dir = /state/openvpn\n");
    expect(config).toContain("database = $dir/index.txt\n");
    expect(config).toContain("[server_cert]\n");
    expect(config).toContain("extendedKeyUsage = clientAuth\n");
  });

  test("generates server config with canonical routes and DNS pushes", () => {
    const config = serverConfig({
      routes: ["10.20.30.40/16", "invalid"],
      dnsServers: ["10.0.0.53"],
      port: 21194,
      interfaceName: "tun-test",
      subnet: "10.250.0.0",
      netmask: "255.255.255.0",
      caCert: "/pki/ca.crt",
      serverCert: "/pki/server.crt",
      serverKey: "/pki/server.key",
      crl: "/pki/crl.pem",
      tlsCrypt: "/pki/tls.key",
      pidFile: "/run/openvpn.pid",
      statusFile: "/run/openvpn.csv",
    });

    expect(config).toStartWith("port 21194\nproto udp\ndev tun-test\n");
    expect(config).toContain('push "route 10.20.0.0 255.255.0.0"\n');
    expect(config).not.toContain("invalid");
    expect(config).toContain('push "dhcp-option DNS 10.0.0.53"\n');
    expect(config).toContain("status /run/openvpn.csv 5\nstatus-version 2\n");
  });

  test("parses connected common names from status version 2 CSV", () => {
    const status = [
      "TITLE,OpenVPN 2.6",
      "TIME,2026-07-20 12:00:00,1784548800",
      "CLIENT_LIST,device-one,198.51.100.1:1234,10.250.0.2",
      "ROUTING_TABLE,10.250.0.2,device-one,198.51.100.1:1234",
      "CLIENT_LIST,device-two,203.0.113.2:5678,10.250.0.3",
      "END",
    ].join("\n");

    expect(parseConnectedCommonNames(status)).toEqual(["device-one", "device-two"]);
  });
});
