import { cidrRoute } from "./cidr-route";

export interface OpenVpnServerConfigOptions {
  routes: string[];
  dnsServers: string[];
  port: number;
  interfaceName: string;
  subnet: string;
  netmask: string;
  caCert: string;
  serverCert: string;
  serverKey: string;
  crl: string;
  tlsCrypt: string;
  pidFile: string;
  statusFile: string;
}

export function serverConfig(options: OpenVpnServerConfigOptions): string {
  const pushes = options.routes.flatMap((cidr) => {
    const route = cidrRoute(cidr);
    return route ? [`push "route ${route.network} ${route.netmask}"`] : [];
  });
  const dnsPushes = options.dnsServers.map((server) => `push "dhcp-option DNS ${server}"`);
  return `port ${options.port}
proto udp
dev ${options.interfaceName}
topology subnet
server ${options.subnet} ${options.netmask}
ca ${options.caCert}
cert ${options.serverCert}
key ${options.serverKey}
crl-verify ${options.crl}
tls-crypt ${options.tlsCrypt}
dh none
tls-groups X25519:prime256v1
auth SHA256
cipher AES-256-GCM
data-ciphers AES-256-GCM:AES-128-GCM
keepalive 10 60
persist-key
persist-tun
writepid ${options.pidFile}
status ${options.statusFile} 5
status-version 2
verb 3
explicit-exit-notify 1
${pushes.join("\n")}
${dnsPushes.join("\n")}
`;
}
