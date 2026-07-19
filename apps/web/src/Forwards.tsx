import { ArrowRight, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api, errorMessage, type Forward, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { EmptyListItem } from "./components/Feedback";
import { ToggleSwitch } from "./components/ToggleSwitch";
import { usePoll } from "./hooks/usePoll";
import { LIST_ITEM, SEGMENT, SEGMENT_ON } from "./lib/ui";

export function Forwards({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<Forward[]>([]);
  const [range, setRange] = useState<{ lo: number; hi: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [proto, setProto] = useState<"tcp" | "udp">("tcp");
  const [listenPort, setListenPort] = useState(40000);
  const [targetHost, setTargetHost] = useState("");
  const [targetPort, setTargetPort] = useState(22);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const refresh = () =>
    unwrap(api.forwards.get())
      .then(setRows)
      .catch(() => {});
  usePoll(refresh, 5000);
  useEffect(() => {
    unwrap(api.config.get())
      .then((c) => {
        setRange(c.forwardPortRange);
        if (c.forwardPortRange) setListenPort(c.forwardPortRange.lo);
      })
      .catch(() => {});
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await unwrap(api.forwards.post({ name, proto, listenPort, targetHost, targetPort, enabled: true }));
      setAdding(false);
      setName("");
      setTargetHost("");
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function toggle(f: Forward) {
    setTogglingId(f.id);
    try {
      await unwrap(api.forwards({ id: f.id }).patch({ enabled: !f.enabled }));
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(id: string) {
    try {
      await unwrap(api.forwards({ id }).delete());
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <>
      <CardHeader title="Port Forwards">
        <button type="button" className="btn small" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add"}
        </button>
      </CardHeader>
      <p className="-mt-[0.35rem] mb-4 max-w-[52ch] text-[0.78rem] leading-[1.55] text-[var(--ink-2)]">
        Make a service inside the VPN reachable on a port of this gateway.
        {range ? ` Choose a port from ${range.lo} to ${range.hi}.` : " Choose any free port on this gateway."}
      </p>

      {adding && (
        <form
          className="mb-4 animate-[rise_0.25s_ease-out] border border-dashed border-[var(--line)] p-[0.9rem]"
          onSubmit={add}
        >
          <div className="grid grid-cols-2 gap-[0.8rem]">
            <label>
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="gitlab-ssh" />
            </label>
            <fieldset className="m-0 mb-[0.9rem] min-w-0 border-0 p-0 text-xs uppercase tracking-[0.08em] text-[var(--ink-2)]">
              <legend className="p-0">Protocol</legend>
              <div className="mt-[0.35rem] mb-[0.9rem] flex">
                {(["tcp", "udp"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${SEGMENT} ${proto === p ? SEGMENT_ON : ""}`}
                    onClick={() => setProto(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="grid grid-cols-2 gap-[0.8rem]">
            <label>
              Listen port
              <input
                required
                type="number"
                min={range?.lo ?? 1}
                max={range?.hi ?? 65535}
                value={listenPort}
                onChange={(e) => setListenPort(+e.target.value)}
              />
            </label>
            <label>
              Target host:port
              <div className="mt-[0.35rem] grid grid-cols-2 gap-[0.4rem] [&>input]:!mt-0">
                <input
                  required
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  placeholder="10.1.2.3"
                />
                <input
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={targetPort}
                  onChange={(e) => setTargetPort(+e.target.value)}
                />
              </div>
            </label>
          </div>
          <button type="submit" className="btn primary">
            Add forward
          </button>
        </form>
      )}

      <ul className="list-none p-0">
        {rows.length === 0 && !adding && <EmptyListItem>No forwarding rules yet.</EmptyListItem>}
        {rows.map((f) => (
          <li key={f.id} className={LIST_ITEM}>
            <div className="flex min-w-0 flex-row items-center gap-3 whitespace-nowrap">
              <span className="text-[0.9rem] font-semibold">
                <span
                  className={`mr-[0.35rem] inline-block size-[7px] rounded-full ${f.running ? "bg-[var(--ok)] shadow-[0_0_6px_var(--ok)]" : "bg-[var(--ink-3)]"}`}
                />{" "}
                {f.name}
              </span>
              <span className="inline-flex items-center gap-1 font-[var(--mono)] text-[0.78rem] text-[var(--ink-2)]">
                <span>
                  :{f.listenPort}/{f.proto}
                </span>
                <ArrowRight size={11} />
                <span>
                  {f.targetHost}:{f.targetPort}
                </span>
              </span>
            </div>
            <div className="flex shrink-0 gap-[0.4rem]">
              <ToggleSwitch
                checked={f.enabled}
                disabled={togglingId === f.id}
                label={togglingId === f.id ? "Applying..." : f.enabled ? "Enabled" : "Disabled"}
                onChange={() => toggle(f)}
              />
              <button
                type="button"
                className="btn danger ghost small"
                aria-label="Delete rule"
                onClick={() => remove(f.id)}
              >
                <X size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
