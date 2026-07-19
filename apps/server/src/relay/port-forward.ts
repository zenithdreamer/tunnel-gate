import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { connect, createServer } from "node:net";

export interface ForwardHandle {
  stop(): Promise<void>;
}

const UDP_SESSION_IDLE_MS = 60_000;

export function startTcpForward(
  listenPort: number,
  targetHost: string,
  targetPort: number,
  onLog: (line: string) => void,
  onExit: (code: number) => void,
): ForwardHandle {
  const server = createServer((client) => {
    const upstream = connect(targetPort, targetHost);
    client.pipe(upstream);
    upstream.pipe(client);
    const cleanup = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", cleanup);
    upstream.on("error", cleanup);
  });
  server.on("error", (error) => {
    onLog(`listen error: ${error.message}`);
    onExit(1);
  });
  server.listen(listenPort);
  return { stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

export function startUdpForward(
  listenPort: number,
  targetHost: string,
  targetPort: number,
  onLog: (line: string) => void,
  onExit: (code: number) => void,
): ForwardHandle {
  const listener = createSocket("udp4");
  const sessions = new Map<string, UdpSocket>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function closeSession(key: string) {
    sessions.get(key)?.close();
    sessions.delete(key);
    clearTimeout(idleTimers.get(key));
    idleTimers.delete(key);
  }

  function touch(key: string) {
    clearTimeout(idleTimers.get(key));
    idleTimers.set(
      key,
      setTimeout(() => closeSession(key), UDP_SESSION_IDLE_MS),
    );
  }

  listener.on("message", (message, remote) => {
    const key = `${remote.address}:${remote.port}`;
    let upstream = sessions.get(key);
    if (!upstream) {
      upstream = createSocket("udp4");
      upstream.on("message", (reply) => listener.send(reply, remote.port, remote.address));
      upstream.on("error", () => closeSession(key));
      sessions.set(key, upstream);
    }
    touch(key);
    upstream.send(message, targetPort, targetHost);
  });
  listener.on("error", (error) => {
    onLog(`listen error: ${error.message}`);
    onExit(1);
  });
  listener.bind(listenPort);

  return {
    stop: () =>
      new Promise((resolve) => {
        for (const key of [...sessions.keys()]) closeSession(key);
        listener.close(() => resolve());
      }),
  };
}
