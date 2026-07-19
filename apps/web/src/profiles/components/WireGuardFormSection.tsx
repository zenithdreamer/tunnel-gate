interface WireGuardFormSectionProps {
  config: string;
  setConfig: (value: string) => void;
  onLoadFile: () => void;
}

export function WireGuardFormSection({ config, setConfig, onLoadFile }: WireGuardFormSectionProps) {
  return (
    <label>
      WireGuard config (wg-quick){" "}
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
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        placeholder={
          "[Interface]\nPrivateKey = …\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 10.0.0.0/8"
        }
        spellCheck={false}
      />
    </label>
  );
}
