import { X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Profile, type TunnelStatus, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { EmptyListItem } from "./components/Feedback";
import { StatusBadge } from "./components/StatusBadge";
import { LIST_ITEM, SEGMENT, SEGMENT_ON } from "./lib/ui";
import { L2tpFormSection } from "./profiles/components/L2tpFormSection";
import { NetbirdFormSection } from "./profiles/components/NetbirdFormSection";
import { OpenVpnFormSection } from "./profiles/components/OpenVpnFormSection";
import { TailscaleFormSection } from "./profiles/components/TailscaleFormSection";
import { WireGuardFormSection } from "./profiles/components/WireGuardFormSection";
import { parseOpenVpnImport, parseWireGuardImport } from "./profiles/config-import";
import { commaList, PROFILE_TYPE_LABEL, PROFILE_TYPES } from "./profiles/model";

interface Props {
  profiles: Profile[];
  status: TunnelStatus | null;
  busy: boolean;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}

export function Profiles({ profiles, status, busy, onConnect, onDisconnect, onChanged, onError }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const tunnelFor = (id: string) =>
    status?.tunnels.find((t) => t.profileId === id && (t.state === "connected" || t.state === "connecting"));
  const formOpen = adding || editingId !== null;
  const finishEditing = useCallback(() => {
    setAdding(false);
    setEditingId(null);
    onChanged();
  }, [onChanged]);

  async function toggleAuto(p: Profile) {
    try {
      await unwrap(api.profiles({ id: p.id }).autoconnect.patch({ enabled: !p.autoConnect }));
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this VPN profile?")) return;
    try {
      await unwrap(api.profiles({ id }).delete());
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <>
      <CardHeader title="VPN Profiles">
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setEditingId(null);
            setAdding(!formOpen);
          }}
        >
          {formOpen ? "Cancel" : "+ Add"}
        </button>
      </CardHeader>

      {formOpen && <ProfileForm key={editingId ?? "new"} editId={editingId} onDone={finishEditing} onError={onError} />}

      <ul className="list-none p-0">
        {profiles.length === 0 && !formOpen && <EmptyListItem>No profiles yet. Add one to begin.</EmptyListItem>}
        {profiles.map((p) => {
          const tun = tunnelFor(p.id);
          return (
            <li
              key={p.id}
              className={`${LIST_ITEM} ${tun ? "border-l-2 border-l-[var(--ok)] bg-[rgba(76,175,125,0.06)]" : ""}`}
            >
              <div className="flex min-w-0 flex-col gap-[0.15rem]">
                <span className="text-[0.9rem] font-semibold">{p.name}</span>
                <StatusBadge>{PROFILE_TYPE_LABEL[p.type]}</StatusBadge>
                {tun?.iface && (
                  <StatusBadge>
                    {tun.iface}
                    {tun.addr ? ` ${tun.addr}` : ""}
                  </StatusBadge>
                )}
                <span className="font-[var(--mono)] text-[0.78rem] text-[var(--ink-2)]">{p.summary}</span>
                {p.routes.length > 0 && (
                  <span className="font-[var(--mono)] text-[0.78rem] text-[var(--ink-2)]">
                    Routes: {p.routes.join(", ")}
                  </span>
                )}
                {p.dnsServers.length > 0 && (
                  <span className="font-[var(--mono)] text-[0.78rem] text-[var(--ink-2)]">
                    DNS: {p.dnsServers.join(", ")}
                  </span>
                )}
                {tun?.loginUrl && (
                  <a
                    className="btn auto-on small mt-1 w-fit no-underline"
                    href={tun.loginUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Authorize {p.type === "netbird" ? "NetBird" : "Tailscale"}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 gap-[0.4rem]">
                {p.autoConnect ? null : tun ? (
                  <button
                    type="button"
                    className="btn danger small"
                    disabled={busy && tun.state !== "connecting"}
                    onClick={() => onDisconnect(p.id)}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button type="button" className="btn small" disabled={busy} onClick={() => onConnect(p.id)}>
                    Connect
                  </button>
                )}
                <button
                  type="button"
                  className={`btn small ${p.autoConnect ? "auto-on" : "ghost"}`}
                  title="Connect automatically on startup and after a dropped link"
                  onClick={() => toggleAuto(p)}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(editingId === p.id ? null : p.id);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn danger ghost small"
                  aria-label="Delete profile"
                  disabled={!!tun}
                  onClick={() => remove(p.id)}
                >
                  <X size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ProfileForm({
  editId,
  onDone,
  onError,
}: {
  editId: string | null;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [type, setType] = useState<Profile["type"]>("openvpn");
  const [name, setName] = useState("");
  const [routes, setRoutes] = useState("");
  const [dnsServers, setDnsServers] = useState("");
  const [ovpn, setOvpn] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wgConf, setWgConf] = useState("");
  const [server, setServer] = useState("");
  const [psk, setPsk] = useState("");
  const [tailscaleAuthKey, setTailscaleAuthKey] = useState("");
  const [tailscaleMode, setTailscaleMode] = useState<"authkey" | "login">("authkey");
  const [tailscaleHostname, setTailscaleHostname] = useState("");
  const [tailscaleLoginServer, setTailscaleLoginServer] = useState("");
  const [netbirdSetupKey, setNetbirdSetupKey] = useState("");
  const [netbirdMode, setNetbirdMode] = useState<"setupkey" | "login">("setupkey");
  const [netbirdHostname, setNetbirdHostname] = useState("");
  const [netbirdManagementUrl, setNetbirdManagementUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editId !== null);
  const editing = editId !== null;

  useEffect(() => {
    if (!editId) return;
    const controller = new AbortController();
    setLoading(true);
    unwrap(api.profiles({ id: editId }).get({ fetch: { signal: controller.signal } }))
      .then((p) => {
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setType(p.type);
        setName(p.name);
        setRoutes(p.routes.join(", "));
        setDnsServers(p.dnsServers.join(", "));
        setOvpn(str(p.config.ovpn));
        setUsername(str(p.config.username));
        setWgConf(str(p.config.conf));
        setServer(str(p.config.server));
        if (p.type === "tailscale") {
          setTailscaleMode(p.config.mode === "login" ? "login" : "authkey");
          setTailscaleHostname(str(p.config.hostname));
          setTailscaleLoginServer(str(p.config.loginServer));
        }
        if (p.type === "netbird") {
          setNetbirdMode(p.config.mode === "login" ? "login" : "setupkey");
          setNetbirdHostname(str(p.config.hostname));
          setNetbirdManagementUrl(str(p.config.managementUrl));
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        onError(errorMessage(error));
        onDone();
      });
    return () => controller.abort();
  }, [editId, onDone, onError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const config =
      type === "openvpn"
        ? { ovpn, ...(username ? { username, password } : {}) }
        : type === "wireguard"
          ? { conf: wgConf }
          : type === "tailscale"
            ? {
                mode: tailscaleMode,
                ...(tailscaleMode === "authkey" ? { authKey: tailscaleAuthKey } : {}),
                ...(tailscaleHostname ? { hostname: tailscaleHostname } : {}),
                ...(tailscaleLoginServer ? { loginServer: tailscaleLoginServer } : {}),
              }
            : type === "netbird"
              ? {
                  mode: netbirdMode,
                  ...(netbirdMode === "setupkey" ? { setupKey: netbirdSetupKey } : {}),
                  ...(netbirdHostname ? { hostname: netbirdHostname } : {}),
                  ...(netbirdManagementUrl ? { managementUrl: netbirdManagementUrl } : {}),
                }
              : { server, psk, username, password };
    setSaving(true);
    try {
      const body = { name, type, config, routes: commaList(routes), dnsServers: commaList(dnsServers) };
      await unwrap(editing ? api.profiles({ id: editId as string }).put(body) : api.profiles.post(body));
      onDone();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-4 animate-[rise_0.25s_ease-out] border border-dashed border-[var(--line)] p-[0.9rem] text-[0.78rem] text-[var(--ink-2)]">
        Loading profile…
      </div>
    );
  }

  function loadFile(setter: (v: string) => void, source: "openvpn" | "wireguard") {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f)
        f.text()
          .then((text) => {
            setter(text);
            if (source === "openvpn") {
              const imported = parseOpenVpnImport(text);
              if (imported.routes.length) setRoutes(imported.routes.join(", "));
              if (imported.dnsServers.length) setDnsServers(imported.dnsServers.join(", "));
              if (imported.credentials) {
                setUsername(imported.credentials.username);
                setPassword(imported.credentials.password);
              }
            } else {
              const imported = parseWireGuardImport(text);
              if (imported.routes.length) setRoutes(imported.routes.join(", "));
              if (imported.dnsServers.length) setDnsServers(imported.dnsServers.join(", "));
            }
          })
          .catch(() => onError("Could not read the selected VPN configuration"));
    };
    input.click();
  }

  return (
    <form
      className="mb-4 animate-[rise_0.25s_ease-out] border border-dashed border-[var(--line)] p-[0.9rem]"
      onSubmit={submit}
    >
      <div className="mt-[0.35rem] mb-[0.9rem] flex">
        {PROFILE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={editing}
            className={`${SEGMENT} ${type === t ? SEGMENT_ON : ""}`}
            onClick={() => setType(t)}
          >
            {PROFILE_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <label>
        Profile name
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Office" />
      </label>

      {type === "openvpn" && (
        <OpenVpnFormSection
          editing={editing}
          ovpn={ovpn}
          setOvpn={setOvpn}
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          onLoadFile={() => loadFile(setOvpn, "openvpn")}
        />
      )}

      {type === "wireguard" && (
        <WireGuardFormSection
          config={wgConf}
          setConfig={setWgConf}
          onLoadFile={() => loadFile(setWgConf, "wireguard")}
        />
      )}

      {type === "l2tp" && (
        <L2tpFormSection
          editing={editing}
          server={server}
          setServer={setServer}
          psk={psk}
          setPsk={setPsk}
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
        />
      )}

      {type === "tailscale" && (
        <TailscaleFormSection
          editing={editing}
          mode={tailscaleMode}
          setMode={setTailscaleMode}
          authKey={tailscaleAuthKey}
          setAuthKey={setTailscaleAuthKey}
          hostname={tailscaleHostname}
          setHostname={setTailscaleHostname}
          loginServer={tailscaleLoginServer}
          setLoginServer={setTailscaleLoginServer}
        />
      )}

      {type === "netbird" && (
        <NetbirdFormSection
          editing={editing}
          mode={netbirdMode}
          setMode={setNetbirdMode}
          setupKey={netbirdSetupKey}
          setSetupKey={setNetbirdSetupKey}
          hostname={netbirdHostname}
          setHostname={setNetbirdHostname}
          managementUrl={netbirdManagementUrl}
          setManagementUrl={setNetbirdManagementUrl}
        />
      )}

      <label>
        VPN target routes <span className="text-[var(--ink-2)]">(CIDRs whose forwards use this tunnel)</span>
        <input value={routes} onChange={(e) => setRoutes(e.target.value)} placeholder="10.0.0.0/8, 172.16.0.0/12" />
      </label>
      <label>
        VPN DNS servers{" "}
        <span className="text-[var(--ink-2)]">(routed through this profile and provided to VPN clients)</span>
        <input value={dnsServers} onChange={(e) => setDnsServers(e.target.value)} placeholder="10.0.0.53, 10.0.0.54" />
      </label>
      <button type="submit" className="btn primary" disabled={saving}>
        {saving ? "Saving…" : editing ? "Save changes" : "Save profile"}
      </button>
    </form>
  );
}
