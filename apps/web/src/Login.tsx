import { ArrowRight, CircleAlert, LoaderCircle, ShieldHalf, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api, unwrap } from "./api";
import { signIn, signUp } from "./auth";
import { ErrorMessage, LoadingPanel } from "./components/Feedback";

export function Login() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    unwrap(api.setup.get())
      .then((r) => setNeedsSetup(!!r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = needsSetup
        ? await signUp.email({ email, password, name: name || email.split("@")[0] })
        : await signIn.email({ email, password });
      if (res.error) setError(res.error.message ?? "failed");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  if (needsSetup === null) {
    return <LoadingPanel>Checking setup…</LoadingPanel>;
  }

  return (
    <div className="grid min-h-screen place-items-center p-8">
      <div className="w-[min(380px,100%)] animate-[rise_0.4s_ease-out] border border-[var(--line)] border-t-[3px] border-t-[var(--accent)] bg-[var(--surface)] p-8">
        <div className="mb-6">
          <span className="mr-[0.4rem] inline-flex align-middle text-[var(--accent)]">
            <ShieldHalf size={28} strokeWidth={1.75} />
          </span>
          <h1 className="text-[1.6rem] tracking-[0.04em]">tunnel-gate</h1>
          <p className="text-[var(--ink-2)]">
            {needsSetup ? "First run: create the admin account" : "Internal network gateway console"}
          </p>
        </div>
        <form onSubmit={submit}>
          {needsSetup && (
            <label>
              Admin name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
            />
          </label>
          {error && (
            <ErrorMessage>
              <CircleAlert size={14} /> {error}
            </ErrorMessage>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : needsSetup ? (
              <>
                Create admin account <UserPlus size={14} />
              </>
            ) : (
              <>
                Sign in <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
        {needsSetup && (
          <p className="mt-4 text-[0.78rem] leading-[1.5] text-[var(--ink-2)]">
            This account manages VPN profiles and gateway access. Sign-up closes automatically afterwards.
          </p>
        )}
      </div>
    </div>
  );
}
