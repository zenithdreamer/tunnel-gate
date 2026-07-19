import { ArrowDown, ArrowUp } from "lucide-react";
import { fmtRate } from "../lib/format";
import { STAT, STAT_ROW } from "../lib/ui";

export function RateStats({ rx, tx }: { rx: number; tx: number }) {
  return (
    <div className={STAT_ROW}>
      <span className={`${STAT} text-[var(--rx)]`}>
        <ArrowDown size={13} /> {fmtRate(rx)}
      </span>
      <span className={`${STAT} text-[var(--tx)]`}>
        <ArrowUp size={13} /> {fmtRate(tx)}
      </span>
    </div>
  );
}
