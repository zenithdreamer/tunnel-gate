import type { ReactNode } from "react";

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function CardHeader({ title, subtitle, children }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
      {subtitle ? (
        <div>
          <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-2)] before:text-[var(--accent)] before:content-['▸_']">
            {title}
          </h2>
          {subtitle}
        </div>
      ) : (
        <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-2)] before:text-[var(--accent)] before:content-['▸_']">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
