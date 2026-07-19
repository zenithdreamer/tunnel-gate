import { useEffect, useRef, useState } from "react";
import { api, type Profile, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { usePoll } from "./hooks/usePoll";

interface LogLine {
  t: number;
  line: string;
  profileId: string | null;
}

export function Logs({ profiles }: { profiles: Profile[] }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const after = useRef(0);
  const box = useRef<HTMLPreElement>(null);

  usePoll(async () => {
    try {
      const fresh = await unwrap(api.tunnel.logs.get({ query: { after: after.current } }));
      if (fresh.length) {
        after.current = fresh[fresh.length - 1].t;
        setLines((prev) => [...prev, ...fresh].slice(-400));
      }
    } catch {}
  }, 2000);

  const visible = filter === "all" ? lines : lines.filter((l) => l.profileId === filter);

  const copyLogs = async () => {
    const text = visible.map((l) => `${new Date(l.t).toLocaleTimeString()}  ${l.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const stickToBottom = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content only
  useEffect(() => {
    if (stickToBottom.current) box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [visible.length]);

  return (
    <>
      <CardHeader title="Tunnel Log">
        <div className="flex items-center gap-2">
          <select
            className="border border-[var(--line)] bg-[var(--bg)] px-2 py-[0.3rem] font-[var(--mono)] text-[0.75rem] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost small" onClick={copyLogs} disabled={visible.length === 0}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={async () => {
              try {
                await unwrap(api.tunnel.logs.delete());
                setLines([]);
              } catch {}
            }}
          >
            Clear
          </button>
        </div>
      </CardHeader>
      <pre
        className="mt-[0.9rem] min-h-[140px] max-h-[300px] overflow-auto border border-[var(--line)] bg-[var(--bg)] px-[0.8rem] py-[0.7rem] font-[var(--mono)] text-[0.72rem] leading-[1.55] break-all whitespace-pre-wrap text-[var(--ink-2)]"
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
      >
        {visible.length === 0
          ? filter === "all"
            ? "No log entries yet."
            : "No log entries for this profile yet."
          : visible.map((l) => `${new Date(l.t).toLocaleTimeString()}  ${l.line}`).join("\n")}
      </pre>
    </>
  );
}
