import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CARD } from "../lib/ui";

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  detail: ReactNode;
  detailClass?: string;
}

export function StatCard({ label, icon: Icon, value, detail, detailClass = "text-[var(--ink-2)]" }: StatCardProps) {
  return (
    <section className={`${CARD} !p-4`}>
      <div className="mb-3 flex items-center justify-between text-[var(--ink-3)]">
        <span className="font-[var(--mono)] text-[0.65rem] uppercase tracking-[0.1em]">{label}</span>
        <Icon size={16} />
      </div>
      <strong className="block font-[var(--mono)] text-2xl font-medium text-[var(--ink)]">{value}</strong>
      <span className={`mt-1 block text-xs ${detailClass}`}>{detail}</span>
    </section>
  );
}
