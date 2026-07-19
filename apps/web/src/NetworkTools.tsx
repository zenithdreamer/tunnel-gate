import { type FormEvent, useState } from "react";
import { api, errorMessage, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { CARD, SPAN_TWO } from "./lib/ui";

type Tool = "ping" | "dns" | "route" | "tcp";

interface ToolDefinition {
  id: Tool;
  label: string;
  description: string;
  placeholder: string;
}

const TOOLS: ToolDefinition[] = [
  {
    id: "ping",
    label: "Ping",
    description: "Check whether a host responds from the gateway.",
    placeholder: "10.1.2.3 or host.example.com",
  },
  {
    id: "dns",
    label: "DNS Lookup",
    description: "Look up the IP address a hostname resolves to.",
    placeholder: "host.example.com",
  },
  {
    id: "route",
    label: "Route Lookup",
    description: "Show which path the gateway takes to reach an address.",
    placeholder: "10.1.2.3 or host.example.com",
  },
  {
    id: "tcp",
    label: "TCP Port",
    description: "Check whether a service is accepting connections on a port.",
    placeholder: "10.1.2.3 or host.example.com",
  },
];

function DiagnosticCard({ tool }: { tool: ToolDefinition }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(443);
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOutput(null);
    try {
      const result =
        tool.id === "ping"
          ? await unwrap(api.net.ping.post({ host }))
          : await unwrap(api.net.diagnostic.post({ tool: tool.id, host, ...(tool.id === "tcp" ? { port } : {}) }));
      setOutput(result.output || (result.ok ? "Completed successfully" : "Diagnostic failed"));
    } catch (error) {
      setOutput(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={CARD}>
      <CardHeader title={tool.label} />
      <p className="-mt-[0.35rem] mb-4 max-w-[52ch] text-[0.78rem] leading-[1.55] text-[var(--ink-2)]">
        {tool.description}
      </p>
      <form
        className={`mt-1 grid gap-2 ${tool.id === "tcp" ? "sm:grid-cols-[1fr_100px_auto]" : "sm:grid-cols-[1fr_auto]"}`}
        onSubmit={run}
      >
        <input
          required
          value={host}
          onChange={(event) => setHost(event.target.value)}
          placeholder={tool.placeholder}
          className="!mt-0 font-[var(--mono)]"
        />
        {tool.id === "tcp" && (
          <input
            required
            type="number"
            min={1}
            max={65535}
            value={port}
            aria-label="TCP port"
            onChange={(event) => setPort(Number(event.target.value))}
            className="!mt-0"
          />
        )}
        <button type="submit" className="btn min-w-20" disabled={busy}>
          {busy ? "Running..." : "Run"}
        </button>
      </form>
      {output && (
        <pre className="mt-[0.9rem] max-h-[220px] overflow-auto border border-[var(--line)] bg-[var(--bg)] px-[0.8rem] py-[0.7rem] font-[var(--mono)] text-[0.72rem] leading-[1.55] break-all whitespace-pre-wrap text-[var(--ink-2)]">
          {output}
        </pre>
      )}
    </section>
  );
}

function RoutingTableCard() {
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const result = await unwrap(api.net.routes.get());
      setOutput(result.output);
    } catch (error) {
      setOutput(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} ${SPAN_TWO}`}>
      <CardHeader title="Routing Tables">
        <button type="button" className="btn small" disabled={busy} onClick={load}>
          {busy ? "Loading..." : output ? "Refresh" : "Load routes"}
        </button>
      </CardHeader>
      <p className="-mt-[0.35rem] mb-4 max-w-[52ch] text-[0.78rem] leading-[1.55] text-[var(--ink-2)]">
        Inspect IPv4 and IPv6 routes plus policy-routing rules inside the relay.
      </p>
      {output ? (
        <pre className="mt-[0.9rem] min-h-[140px] max-h-[300px] overflow-auto border border-[var(--line)] bg-[var(--bg)] px-[0.8rem] py-[0.7rem] font-[var(--mono)] text-[0.72rem] leading-[1.55] break-all whitespace-pre-wrap text-[var(--ink-2)]">
          {output}
        </pre>
      ) : (
        <div className="border border-dashed border-[var(--line)] py-8 text-center font-[var(--mono)] text-xs text-[var(--ink-3)]">
          Load the current kernel routing state
        </div>
      )}
    </section>
  );
}

export function NetworkTools() {
  return (
    <>
      {TOOLS.map((tool) => (
        <DiagnosticCard key={tool.id} tool={tool} />
      ))}
      <RoutingTableCard />
    </>
  );
}
