import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center gap-[0.6rem] font-[var(--mono)] text-[var(--ink-2)]">
      <LoaderCircle size={16} className="animate-spin" /> {children}
    </div>
  );
}

export function ErrorMessage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mb-3 flex items-center gap-[0.35rem] font-[var(--mono)] text-[0.8rem] text-[var(--bad)] ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <section className="col-span-2 border border-[var(--line)] bg-[var(--surface)] px-[1.4rem] py-12 text-center font-[var(--mono)] text-sm text-[var(--ink-3)] max-[860px]:col-span-1">
      {children}
    </section>
  );
}

export function EmptyListItem({ children }: { children: ReactNode }) {
  return <li className="!justify-center !border-0 !p-[1.2rem] text-[var(--ink-2)]">{children}</li>;
}
