interface OpenVpnFormSectionProps {
  editing: boolean;
  ovpn: string;
  setOvpn: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onLoadFile: () => void;
}

export function OpenVpnFormSection({
  editing,
  ovpn,
  setOvpn,
  username,
  setUsername,
  password,
  setPassword,
  onLoadFile,
}: OpenVpnFormSectionProps) {
  return (
    <>
      <label>
        OpenVPN config (.ovpn){" "}
        <button
          type="button"
          className="mt-[0.8rem] cursor-pointer border-0 bg-transparent p-0 text-[0.78rem] text-[var(--accent)] hover:underline"
          onClick={onLoadFile}
        >
          Load file…
        </button>
        <textarea
          required
          rows={6}
          value={ovpn}
          onChange={(e) => setOvpn(e.target.value)}
          placeholder={"client\nremote vpn.example.com 1194 udp\n…"}
          spellCheck={false}
        />
      </label>
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <label>
          Username <span className="text-[var(--ink-2)]">(optional)</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editing ? "Leave blank to keep current" : undefined}
          />
        </label>
      </div>
    </>
  );
}
