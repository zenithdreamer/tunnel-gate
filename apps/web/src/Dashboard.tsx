import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Cable,
  CircleAlert,
  Radar,
  ScrollText,
  ServerCog,
  ShieldHalf,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  errorMessage,
  type Forward,
  type OpenVpnServerStatus,
  type Profile,
  type Sample,
  type TunnelStatus,
  unwrap,
} from "./api";
import { signOut } from "./auth";
import { Forwards } from "./Forwards";
import { usePoll } from "./hooks/usePoll";
import { Logs } from "./Logs";
import { CARD, PAGE_GRID, SPAN_TWO } from "./lib/ui";
import { NetworkTools } from "./NetworkTools";
import { OpenVpnServer } from "./OpenVpnServer";
import { Profiles } from "./Profiles";
import { System } from "./System";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { OverviewTab } from "./tabs/OverviewTab";

const TABS = [
  { id: "overview", label: "Overview", icon: Radar },
  { id: "tunnels", label: "Tunnels", icon: Cable },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "forwards", label: "Forwards", icon: ArrowLeftRight },
  { id: "server", label: "VPN Server", icon: ServerCog },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "system", label: "System", icon: Boxes },
  { id: "logs", label: "Logs", icon: ScrollText },
] as const;
type TabId = (typeof TABS)[number]["id"];

function readTab(): TabId {
  const h = location.hash.replace(/^#\/?/, "");
  return (TABS.find((t) => t.id === h)?.id ?? "overview") as TabId;
}

export function Dashboard({ user }: { user: { name: string; email: string } }) {
  const [tab, setTab] = useState<TabId>(readTab);
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [openVpnStatus, setOpenVpnStatus] = useState<OpenVpnServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshProfiles = useCallback(() => {
    unwrap(api.profiles.get())
      .then(setProfiles)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  usePoll(async () => {
    const results = await Promise.allSettled([
      unwrap(api.tunnel.status.get()),
      unwrap(api.stats.get()),
      unwrap(api.forwards.get()),
      unwrap(api["openvpn-server"].status.get()),
    ]);
    if (results[0].status === "fulfilled") setStatus(results[0].value);
    if (results[1].status === "fulfilled") setSamples(results[1].value.samples);
    if (results[2].status === "fulfilled") setForwards(results[2].value);
    if (results[3].status === "fulfilled") setOpenVpnStatus(results[3].value);
  }, 2500);

  const tunnelAction = useCallback(async (action: "connect" | "disconnect", profileId: string) => {
    setBusy(true);
    setToast(null);
    try {
      const st = await unwrap(api.tunnel[action].post({ profileId }));
      setStatus(st);
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);
  const connect = useCallback((profileId: string) => tunnelAction("connect", profileId), [tunnelAction]);
  const disconnect = useCallback((profileId: string) => tunnelAction("disconnect", profileId), [tunnelAction]);

  const connectedCount = status?.tunnels.filter((t) => t.state === "connected").length ?? 0;
  const connectingCount = status?.tunnels.filter((t) => t.state === "connecting").length ?? 0;
  const errorCount = status?.tunnels.filter((t) => t.state === "error").length ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] px-[1.2rem] pb-12">
      <header className="mb-[1.2rem] flex flex-wrap items-center gap-4 border-b border-[var(--line)] py-4">
        <div className="text-[1.15rem] font-bold tracking-[0.04em]">
          <span className="mr-[0.4rem] inline-flex align-middle text-[var(--accent)]">
            <ShieldHalf size={20} strokeWidth={1.75} />
          </span>{" "}
          tunnel-gate
        </div>
        {connectingCount > 0 ? (
          <div className="inline-flex items-center gap-2 border border-[var(--line)] px-[0.8rem] py-[0.35rem] font-[var(--mono)] text-[0.75rem] tracking-[0.1em] text-[var(--accent)]">
            <span
              className="size-[15px] shrink-0 animate-spin rounded-full border-2 border-[rgba(232,197,71,0.25)] border-t-[var(--accent)]"
              aria-hidden="true"
            />
            {connectedCount > 0 && `${connectedCount} CONNECTED · `}
            {connectingCount} CONNECTING
          </div>
        ) : connectedCount > 0 ? (
          <div className="inline-flex items-center gap-2 border border-[rgba(76,175,125,0.4)] px-[0.8rem] py-[0.35rem] font-[var(--mono)] text-[0.75rem] tracking-[0.1em] text-[var(--ok)]">
            <span className="size-2 rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" /> {connectedCount}{" "}
            {connectedCount === 1 ? "TUNNEL" : "TUNNELS"} CONNECTED
            {errorCount > 0 && <span className="text-[var(--bad)]"> · {errorCount} ERROR</span>}
          </div>
        ) : errorCount > 0 ? (
          <div className="inline-flex items-center gap-2 border border-[var(--line)] px-[0.8rem] py-[0.35rem] font-[var(--mono)] text-[0.75rem] tracking-[0.1em] text-[var(--bad)]">
            <span className="size-2 rounded-full bg-[var(--bad)] shadow-[0_0_8px_var(--bad)]" /> {errorCount}{" "}
            {errorCount === 1 ? "TUNNEL ERROR" : "TUNNEL ERRORS"}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 border border-[var(--line)] px-[0.8rem] py-[0.35rem] font-[var(--mono)] text-[0.75rem] tracking-[0.1em]">
            <span className="size-2 rounded-full bg-[var(--ink-3)]" /> NO ACTIVE TUNNELS
          </div>
        )}
        <div className="flex-1" />
        <span className="text-[var(--ink-2)]">{user.email}</span>
        <button type="button" className="btn ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </header>

      <div
        className="-mt-[0.4rem] mb-[1.2rem] flex gap-[0.15rem] overflow-x-auto border-b border-[var(--line)]"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`inline-flex cursor-pointer items-center gap-[0.45rem] whitespace-nowrap border-0 border-b-2 bg-transparent px-[0.9rem] py-[0.55rem] font-[var(--mono)] text-[0.74rem] uppercase tracking-[0.1em] transition-colors ${tab === t.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"}`}
            onClick={() => (location.hash = `/${t.id}`)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {toast && (
        <button
          type="button"
          className="mb-4 flex w-full cursor-pointer appearance-none items-start gap-2 border border-[var(--bad)] bg-[rgba(208,92,92,0.12)] px-[0.9rem] py-[0.6rem] text-left font-[var(--mono)] text-[0.8rem] text-[var(--bad)] [&>svg]:mt-[0.05rem] [&>svg]:shrink-0"
          aria-label={`Dismiss error: ${toast}`}
          onClick={() => setToast(null)}
        >
          <CircleAlert size={14} /> {toast}
        </button>
      )}

      {tab === "overview" && (
        <main className={PAGE_GRID}>
          <OverviewTab
            status={status}
            openVpnStatus={openVpnStatus}
            profiles={profiles}
            forwards={forwards}
            samples={samples}
          />
        </main>
      )}

      {tab === "tunnels" && (
        <main className={PAGE_GRID}>
          <section className={`${CARD} ${SPAN_TWO}`}>
            <Profiles
              profiles={profiles}
              status={status}
              busy={busy}
              onConnect={connect}
              onDisconnect={disconnect}
              onChanged={refreshProfiles}
              onError={setToast}
            />
          </section>
        </main>
      )}

      {tab === "analytics" && (
        <main className={PAGE_GRID}>
          <AnalyticsTab status={status} profiles={profiles} samples={samples} />
        </main>
      )}

      {tab === "forwards" && (
        <main className={PAGE_GRID}>
          <section className={`${CARD} ${SPAN_TWO}`}>
            <Forwards onError={setToast} />
          </section>
        </main>
      )}

      {tab === "server" && (
        <main className={PAGE_GRID}>
          <section className={`${CARD} ${SPAN_TWO}`}>
            <OpenVpnServer onError={setToast} />
          </section>
        </main>
      )}

      {tab === "tools" && (
        <main className={PAGE_GRID}>
          <NetworkTools />
        </main>
      )}

      {tab === "system" && (
        <main className={PAGE_GRID}>
          <System />
        </main>
      )}

      {tab === "logs" && (
        <main className={PAGE_GRID}>
          <section className={`${CARD} ${SPAN_TWO}`}>
            <Logs profiles={profiles} />
          </section>
        </main>
      )}
    </div>
  );
}
