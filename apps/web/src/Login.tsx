import { ArrowRight, CircleAlert, LoaderCircle, ShieldHalf, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DEMO_AUTH_KEY, signIn, signUp } from "./auth";
import { ErrorMessage } from "./components/Feedback";

interface LoginProps {
  needsSetup?: boolean;
  demo?: { email: string; password: string };
  onDemoAuthed?: () => void;
}

export function Login({ needsSetup = false, demo, onDemoAuthed }: LoginProps) {
  const [email, setEmail] = useState(demo?.email ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (demo) {
      if (email === demo.email && password === demo.password) {
        sessionStorage.setItem(DEMO_AUTH_KEY, "1");
        onDemoAuthed?.();
      } else {
        setError("Use the demo credentials shown above");
      }
      return;
    }
    setBusy(true);
    try {
      const res = needsSetup
        ? await signUp.email({
            email,
            password,
            name: name || email.split("@")[0],
          })
        : await signIn.email({ email, password });
      if (res.error) setError(res.error.message ?? "failed");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
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
            {demo
              ? "Demo mode"
              : needsSetup
                ? "First run: create the admin account"
                : "Internal network gateway console"}
          </p>
        </div>
        {demo && (
          <div className="mb-5 border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] bg-[var(--bg)] p-3 font-[var(--mono)] text-[0.78rem] leading-[1.7]">
            <div className="mb-1 uppercase tracking-[0.1em] text-[var(--ink-2)]">Demo credentials</div>
            <div>
              email: <span className="text-[var(--accent)]">{demo.email}</span>
            </div>
            <div>
              password: <span className="text-[var(--accent)]">{demo.password}</span>
            </div>
          </div>
        )}
        <form onSubmit={submit}>
          {needsSetup && !demo && (
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
            ) : needsSetup && !demo ? (
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
        {needsSetup && !demo && (
          <p className="mt-4 text-[0.78rem] leading-[1.5] text-[var(--ink-2)]">
            This account manages VPN profiles and gateway access. Sign-up closes automatically afterwards.
          </p>
        )}
      </div>
    </div>
  );
}
