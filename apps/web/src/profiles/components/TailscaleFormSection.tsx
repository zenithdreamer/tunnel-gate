import { SEGMENT, SEGMENT_ON } from "../../lib/ui";

interface TailscaleFormSectionProps {
  editing: boolean;
  mode: "authkey" | "login";
  setMode: (value: "authkey" | "login") => void;
  authKey: string;
  setAuthKey: (value: string) => void;
  hostname: string;
  setHostname: (value: string) => void;
  loginServer: string;
  setLoginServer: (value: string) => void;
}

export function TailscaleFormSection({
  editing,
  mode,
  setMode,
  authKey,
  setAuthKey,
  hostname,
  setHostname,
  loginServer,
  setLoginServer,
}: TailscaleFormSectionProps) {
  return (
    <>
      <label>
        Enrollment mode
        <div className="mt-[0.35rem] flex">
          <button
            type="button"
            className={`${SEGMENT} ${mode === "authkey" ? SEGMENT_ON : ""}`}
            onClick={() => setMode("authkey")}
          >
            Auth key
          </button>
          <button
            type="button"
            className={`${SEGMENT} ${mode === "login" ? SEGMENT_ON : ""}`}
            onClick={() => setMode("login")}
          >
            Browser login
          </button>
        </div>
      </label>
      {mode === "authkey" ? (
        <label>
          Auth key
          <input
            required={!editing}
            type="password"
            value={authKey}
            onChange={(event) => setAuthKey(event.target.value)}
            placeholder={editing ? "Leave blank to keep current" : "tskey-auth-..."}
          />
        </label>
      ) : (
        <p className="!mb-4 text-[0.78rem] text-[var(--ink-2)]">
          Connect the profile, then open the authorization URL shown in Logs. You stay signed in after reconnecting.
        </p>
      )}
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <label>
          Node hostname <span className="text-[var(--ink-2)]">(optional)</span>
          <input
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="tunnel-gate-office"
          />
        </label>
        <label>
          Control server <span className="text-[var(--ink-2)]">(optional, for Headscale)</span>
          <input
            value={loginServer}
            onChange={(event) => setLoginServer(event.target.value)}
            placeholder="https://controlplane.tailscale.com"
          />
        </label>
      </div>
    </>
  );
}
