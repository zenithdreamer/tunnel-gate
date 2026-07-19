import { ArrowLeftRight, Cable, ServerCog, ShieldHalf } from "lucide-react";
import { useMemo, useState } from "react";
import type { Forward, OpenVpnServerStatus, Profile, Sample, TunnelStatus } from "../api";
import { CardHeader } from "../components/CardHeader";
import { RateStats } from "../components/RateStats";
import { StatCard } from "../components/StatCard";
import { Topology } from "../components/Topology";
import { TrafficChart } from "../components/TrafficChart";
import { projectSamples, trafficSourceIds } from "../lib/traffic";
import { CARD, SPAN_TWO } from "../lib/ui";

interface Props {
  status: TunnelStatus | null;
  openVpnStatus: OpenVpnServerStatus | null;
  profiles: Profile[];
  forwards: Forward[];
  samples: Sample[];
}

const SRC_BUTTON =
  "border bg-[var(--bg)] px-[0.6rem] py-1 font-[var(--mono)] text-[0.68rem] tracking-[0.06em] transition-colors";
const SRC_ON = "border-[var(--accent)] text-[var(--accent)]";
const SRC_OFF = "border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)]";

export function OverviewTab({ status, openVpnStatus, profiles, forwards, samples }: Props) {
  const [trafficSrc, setTrafficSrc] = useState<string>("all");

  const connectedCount = status?.tunnels.filter((t) => t.state === "connected").length ?? 0;
  const connectingCount = status?.tunnels.filter((t) => t.state === "connecting").length ?? 0;
  const errorCount = status?.tunnels.filter((t) => t.state === "error").length ?? 0;

  const trafficProfiles = useMemo(() => {
    const active = (status?.tunnels ?? []).filter((t) => t.state === "connected" || t.state === "connecting");
    return trafficSourceIds(
      samples,
      active.map((t) => t.profileId),
    ).map((id) => ({
      id,
      name:
        profiles.find((p) => p.id === id)?.name ??
        status?.tunnels.find((t) => t.profileId === id)?.profileName ??
        id.slice(0, 8),
    }));
  }, [samples, profiles, status]);

  const src = trafficSrc !== "all" && trafficProfiles.some((p) => p.id === trafficSrc) ? trafficSrc : "all";
  const shownSamples = useMemo(() => (src === "all" ? samples : projectSamples(samples, src)), [samples, src]);
  const last = shownSamples.at(-1);

  return (
    <>
      <div className={`${SPAN_TWO} grid grid-cols-2 gap-3 lg:grid-cols-4`}>
        <StatCard
          label="VPN Profiles"
          icon={Cable}
          value={profiles.length}
          detail={`${profiles.filter((profile) => profile.autoConnect).length} auto-connect`}
        />
        <StatCard
          label="Active Tunnels"
          icon={ShieldHalf}
          value={connectedCount}
          detail={`${connectingCount} connecting · ${errorCount} errors`}
        />
        <StatCard
          label="Port Forwards"
          icon={ArrowLeftRight}
          value={forwards.filter((forward) => forward.enabled).length}
          detail={`${forwards.filter((forward) => forward.running).length} running · ${forwards.length} total`}
        />
        <StatCard
          label="VPN Clients"
          icon={ServerCog}
          value={openVpnStatus?.connectedCommonNames.length ?? 0}
          detailClass={openVpnStatus?.running ? "text-[var(--ok)]" : "text-[var(--ink-2)]"}
          detail={
            openVpnStatus?.running ? "Server listening" : openVpnStatus?.enabled ? "Server offline" : "Server disabled"
          }
        />
      </div>
      <section className={`${CARD} ${SPAN_TWO} !pb-[0.9rem]`}>
        <CardHeader title="VPN Client Routing" />
        <Topology
          mode="vpn"
          status={status}
          openVpnStatus={openVpnStatus}
          profiles={profiles}
          forwards={forwards}
          samples={samples}
        />
      </section>
      <section className={`${CARD} ${SPAN_TWO} !pb-[0.9rem]`}>
        <CardHeader title="Port Forwarding" />
        <Topology
          mode="forwards"
          status={status}
          openVpnStatus={openVpnStatus}
          profiles={profiles}
          forwards={forwards}
          samples={samples}
        />
      </section>
      <section className={`${CARD} ${SPAN_TWO}`}>
        <CardHeader title="Link Traffic">
          <RateStats rx={last?.rx ?? 0} tx={last?.tx ?? 0} />
        </CardHeader>
        {trafficProfiles.length > 0 && (
          <div className="-mt-[0.4rem] mb-[0.8rem] flex flex-wrap gap-[0.35rem]">
            <button
              type="button"
              className={`${SRC_BUTTON} ${src === "all" ? SRC_ON : SRC_OFF}`}
              onClick={() => setTrafficSrc("all")}
            >
              ALL
            </button>
            {trafficProfiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${SRC_BUTTON} ${src === p.id ? SRC_ON : SRC_OFF}`}
                onClick={() => setTrafficSrc(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <TrafficChart samples={shownSamples} />
      </section>
    </>
  );
}
