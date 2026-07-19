import type { ChangeEventHandler } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export function ToggleSwitch({ checked, disabled, label, onChange }: ToggleSwitchProps) {
  return (
    <label className="!mb-0 !inline-flex !cursor-pointer !items-center !gap-[0.45rem] !whitespace-nowrap !font-[var(--mono)] !text-[0.68rem] !tracking-[0.06em] !text-[var(--ink-2)] [&:has(input:disabled)]:!cursor-not-allowed [&:has(input:disabled)]:!opacity-45">
      <input className="peer sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span
        className="h-4 w-[30px] border border-[var(--line)] bg-[var(--ink-3)] p-0.5 transition-colors peer-checked:border-[var(--ok)] peer-checked:bg-[var(--ok)] peer-checked:[&>span]:translate-x-3.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
        aria-hidden="true"
      >
        <span className="block size-2.5 bg-[var(--surface)] transition-transform" />
      </span>
      <span>{label}</span>
    </label>
  );
}
