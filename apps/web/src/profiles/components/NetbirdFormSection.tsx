import { SEGMENT, SEGMENT_ON } from "../../lib/ui";

interface NetbirdFormSectionProps {
  editing: boolean;
  mode: "setupkey" | "login";
  setMode: (value: "setupkey" | "login") => void;
  setupKey: string;
  setSetupKey: (value: string) => void;
  hostname: string;
  setHostname: (value: string) => void;
  managementUrl: string;
  setManagementUrl: (value: string) => void;
}

export function NetbirdFormSection({
  editing,
  mode,
  setMode,
  setupKey,
  setSetupKey,
  hostname,
  setHostname,
  managementUrl,
  setManagementUrl,
}: NetbirdFormSectionProps) {
  return (
    <>
      <label>
        Enrollment mode
        <div className="mt-[0.35rem] flex">
          <button
            type="button"
            className={`${SEGMENT} ${mode === "setupkey" ? SEGMENT_ON : ""}`}
            onClick={() => setMode("setupkey")}
          >
            Setup key
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
      {mode === "setupkey" ? (
        <label>
          Setup key
          <input
            required={!editing}
            type="password"
            value={setupKey}
            onChange={(event) => setSetupKey(event.target.value)}
            placeholder={editing ? "Leave blank to keep current" : undefined}
          />
        </label>
      ) : (
        <p className="!mb-4 text-[0.78rem] text-[var(--ink-2)]">
          Connect the profile, then open the authorization URL shown on the profile. You stay signed in after
          reconnecting.
        </p>
      )}
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <label>
          Peer hostname <span className="text-[var(--ink-2)]">(optional)</span>
          <input
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="tunnel-gate-office"
          />
        </label>
        <label>
          Management URL <span className="text-[var(--ink-2)]">(optional, for self-hosting)</span>
          <input
            value={managementUrl}
            onChange={(event) => setManagementUrl(event.target.value)}
            placeholder="https://api.netbird.io:443"
          />
        </label>
      </div>
    </>
  );
}
