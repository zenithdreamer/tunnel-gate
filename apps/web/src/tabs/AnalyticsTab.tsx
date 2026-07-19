import { useMemo } from "react";
import type { Profile, Sample, TunnelStatus } from "../api";
import { CardHeader } from "../components/CardHeader";
import { EmptyPanel } from "../components/Feedback";
import { RateStats } from "../components/RateStats";
import { TrafficChart } from "../components/TrafficChart";
import { projectSamples } from "../lib/traffic";
import { CARD, SPAN_TWO } from "../lib/ui";

interface Props {
  status: TunnelStatus | null;
  profiles: Profile[];
  samples: Sample[];
}

const SUBTITLE = "mt-1 block font-[var(--mono)] text-[0.65rem] uppercase tracking-[0.08em] text-[var(--ink-3)]";

export function AnalyticsTab({ status, profiles, samples }: Props) {
  const profileTraffic = useMemo(
    () =>
      profiles.map((profile) => {
        const profileSamples = projectSamples(samples, profile.id);
        return { profile, samples: profileSamples, last: profileSamples.at(-1) };
      }),
    [profiles, samples],
  );
  const last = samples.at(-1);

  return (
    <>
      <section className={`${CARD} ${SPAN_TWO}`}>
        <CardHeader title="Total Traffic" subtitle={<span className={SUBTITLE}>All VPN profiles combined</span>}>
          <RateStats rx={last?.rx ?? 0} tx={last?.tx ?? 0} />
        </CardHeader>
        <TrafficChart samples={samples} />
      </section>
      {profileTraffic.length === 0 && <EmptyPanel>Add a VPN profile to begin collecting traffic analytics.</EmptyPanel>}
      {profileTraffic.map(({ profile, samples: profileSamples, last: profileLast }) => {
        const tunnelState = status?.tunnels.find((tunnel) => tunnel.profileId === profile.id)?.state ?? "disconnected";
        return (
          <section className={CARD} key={profile.id}>
            <CardHeader
              title={profile.name}
              subtitle={
                <span className={SUBTITLE}>
                  {profile.type} · {tunnelState}
                </span>
              }
            >
              <RateStats rx={profileLast?.rx ?? 0} tx={profileLast?.tx ?? 0} />
            </CardHeader>
            <TrafficChart samples={profileSamples} />
          </section>
        );
      })}
    </>
  );
}
