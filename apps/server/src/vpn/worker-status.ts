export const STATUS_PREFIX = "TUNNEL_GATE_STATUS ";

export type WorkerStatusEvent =
  | { state: "connecting" }
  | { state: "connected"; iface: string; addr: string | null; endpoint: string | null }
  | { state: "stats"; rx: number; tx: number }
  | { state: "login"; url: string }
  | { state: "error"; error: string };

export type ParsedWorkerLine = { kind: "log" } | { kind: "invalid" } | { kind: "event"; event: WorkerStatusEvent };

const WORKER_STATES = ["connecting", "connected", "stats", "login", "error"] as const;

export function formatWorkerStatus(event: WorkerStatusEvent): string {
  return `${STATUS_PREFIX}${JSON.stringify(event)}`;
}

export function parseWorkerStatusLine(line: string): ParsedWorkerLine {
  if (!line.startsWith(STATUS_PREFIX)) return { kind: "log" };
  try {
    const event = JSON.parse(line.slice(STATUS_PREFIX.length)) as WorkerStatusEvent;
    if (!event || typeof event !== "object" || !WORKER_STATES.includes(event.state)) return { kind: "invalid" };
    return { kind: "event", event };
  } catch {
    return { kind: "invalid" };
  }
}

export function isCredentialRejection(message: string): boolean {
  return /authentication failed|(?:credentials?|username or password).*rejected|AUTH_FAILED/i.test(message);
}
