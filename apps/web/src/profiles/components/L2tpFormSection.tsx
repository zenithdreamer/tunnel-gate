interface L2tpFormSectionProps {
  editing: boolean;
  server: string;
  setServer: (value: string) => void;
  psk: string;
  setPsk: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
}

export function L2tpFormSection({
  editing,
  server,
  setServer,
  psk,
  setPsk,
  username,
  setUsername,
  password,
  setPassword,
}: L2tpFormSectionProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <label>
          Server
          <input required value={server} onChange={(e) => setServer(e.target.value)} placeholder="vpn.example.com" />
        </label>
        <label>
          Pre-shared key
          <input
            required={!editing}
            type="password"
            value={psk}
            onChange={(e) => setPsk(e.target.value)}
            placeholder={editing ? "Leave blank to keep current" : undefined}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <label>
          Username
          <input required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input
            required={!editing}
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
