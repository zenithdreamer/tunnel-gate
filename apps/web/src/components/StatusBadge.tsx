import type { ReactNode } from "react";

export function StatusBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`my-[0.1rem] inline-block w-fit border border-[rgba(232,197,71,0.35)] px-[0.4rem] py-[0.05rem] font-[var(--mono)] text-[0.65rem] text-[var(--accent)] ${className}`}
    >
      {children}
    </span>
  );
}
