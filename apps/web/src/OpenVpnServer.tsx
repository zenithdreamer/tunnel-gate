import { Download, Pencil, Plus, ShieldX } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api, errorMessage, type OpenVpnServerStatus, unwrap } from "./api";
import { CardHeader } from "./components/CardHeader";
import { EmptyListItem, ErrorMessage } from "./components/Feedback";
import { StatusBadge } from "./components/StatusBadge";
import { ToggleSwitch } from "./components/ToggleSwitch";
import { usePoll } from "./hooks/usePoll";
import { LIST_ITEM } from "./lib/ui";

export function OpenVpnServer({ onError }: { onError: (message: string) => void }) {
  const [status, setStatus] = useState<OpenVpnServerStatus | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [endpointHost, setEndpointHost] = useState("");
  const [endpointPort, setEndpointPort] = useState(1194);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [savingEndpoint, setSavingEndpoint] = useState(false);

  function refresh() {
    unwrap(api["openvpn-server"].status.get())
      .then(setStatus)
      .catch((error) => onError(errorMessage(error)));
  }

  usePoll(refresh, 2500);

  useEffect(() => {
    if (!status || editingEndpoint) return;
    setEndpointHost(status.host);
    setEndpointPort(status.port);
  }, [status, editingEndpoint]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await unwrap(api["openvpn-server"].devices.post({ name: name.trim() }));
      setName("");
      setAdding(false);
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function revoke(id: string, deviceName: string) {
    if (!confirm(`Permanently delete the VPN profile for "${deviceName}"? It cannot be restored.`)) return;
    try {
      await unwrap(api["openvpn-server"].devices({ id }).delete());
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function toggleServer() {
    if (!status) return;
    setToggling(true);
    try {
      await unwrap(api["openvpn-server"].patch({ enabled: !status.enabled }));
      refresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setToggling(false);
    }
  }

  async function saveEndpoint(event: FormEvent) {
    event.preventDefault();
    setSavingEndpoint(true);
    try {
      const nextStatus = await unwrap(
        api["openvpn-server"].endpoint.patch({ host: endpointHost.trim(), port: endpointPort }),
      );
      setStatus((current) => (current ? { ...current, ...nextStatus } : current));
      setEditingEndpoint(false);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingEndpoint(false);
    }
  }

  return (
    <>
      <CardHeader title="OpenVPN Server">
        <div className="flex items-center gap-[0.8rem]">
          {status?.enabled && (
            <div
              className={`inline-flex items-center gap-[0.4rem] font-[var(--mono)] text-[0.7rem] tracking-[0.1em] ${status.running ? "text-[var(--ok)]" : status.lastError ? "text-[var(--bad)]" : "text-[var(--accent)]"}`}
            >
              <i
                className={`inline-block size-[7px] rounded-full ${status.running ? "bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" : status.lastError ? "bg-[var(--bad)]" : "bg-[var(--accent)]"}`}
              />{" "}
              {status.running ? "LISTENING" : status.lastError ? "ERROR" : "STARTING"}
            </div>
          )}
          <ToggleSwitch
            checked={status?.enabled ?? false}
            disabled={!status || toggling}
            label={toggling ? "Applying..." : status?.enabled ? "Enabled" : "Disabled"}
            onChange={toggleServer}
          />
        </div>
      </CardHeader>

      <div className="mb-4 grid grid-cols-4 border border-[var(--line)] max-[720px]:grid-cols-2 [&>div]:border-r [&>div]:border-[var(--line)] [&>div]:px-4 [&>div]:py-[0.8rem] [&>div:nth-child(2)]:max-[720px]:border-r-0 [&>div:nth-child(-n+2)]:max-[720px]:border-b [&>div:last-child]:border-r-0 [&_span]:mb-[0.3rem] [&_span]:block [&_span]:font-[var(--mono)] [&_span]:text-[0.65rem] [&_span]:uppercase [&_span]:tracking-[0.08em] [&_span]:text-[var(--ink-3)] [&_strong]:block [&_strong]:font-[var(--mono)] [&_strong]:text-[0.82rem] [&_strong]:font-medium">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span>Endpoint</span>
            <strong>
              {status?.host ?? "..."}:{status?.port ?? 1194}/UDP
            </strong>
          </div>
          <button
            type="button"
            className={`btn ghost small !p-2 ${editingEndpoint ? "auto-on" : ""}`}
            aria-label="Edit endpoint"
            title="Edit endpoint"
            onClick={() => setEditingEndpoint((value) => !value)}
          >
            <Pencil size={13} />
          </button>
        </div>
        <div>
          <span>Client network</span>
          <strong>{status?.subnet ?? "10.250.0.0/24"}</strong>
        </div>
        <div>
          <span>Device profiles</span>
          <strong>{status?.devices.length ?? 0}</strong>
        </div>
        <div>
          <span>Connected devices</span>
          <strong>{status?.connectedCommonNames.length ?? 0}</strong>
        </div>
      </div>

      {editingEndpoint && (
        <form className="mb-4 border-l-2 border-[var(--accent)] bg-[var(--bg)] p-4" onSubmit={saveEndpoint}>
          <div className="mb-3 font-[var(--mono)] text-xs uppercase tracking-[0.1em] text-[var(--ink-2)]">
            Endpoint configuration
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_140px_auto]">
            <label className="!mb-0">
              Public host
              <input
                required
                value={endpointHost}
                onChange={(event) => setEndpointHost(event.target.value)}
                placeholder="vpn.example.com"
              />
            </label>
            <label className="!mb-0">
              UDP port
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={endpointPort}
                onChange={(event) => setEndpointPort(Number(event.target.value))}
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn h-9" disabled={savingEndpoint || !endpointHost.trim()}>
                {savingEndpoint ? "Saving..." : "Save"}
              </button>
              <button
                className="btn ghost h-9"
                type="button"
                disabled={savingEndpoint}
                onClick={() => {
                  setEndpointHost(status?.host ?? "");
                  setEndpointPort(status?.port ?? 1194);
                  setEditingEndpoint(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {status?.lastError && (
        <ErrorMessage className="border border-[rgba(208,92,92,0.5)] bg-[rgba(208,92,92,0.08)] px-[0.8rem] py-[0.65rem]">
          {status.lastError}
        </ErrorMessage>
      )}

      <div className="mb-[0.8rem] flex items-center justify-between gap-4 max-[720px]:items-start">
        <div className="grid gap-[0.2rem]">
          <strong>Device profiles</strong>
          <span className="text-[0.78rem] text-[var(--ink-2)]">
            Give each device its own profile. Delete one to cut off just that device.
          </span>
        </div>
        <button type="button" className="btn small" onClick={() => setAdding((value) => !value)}>
          <Plus size={13} /> Add device
        </button>
      </div>

      {adding && (
        <form
          className="mb-[0.8rem] grid grid-cols-[1fr_220px] items-end gap-[0.7rem] border border-[var(--line)] bg-[var(--bg)] p-[0.9rem] max-[720px]:grid-cols-1"
          onSubmit={create}
        >
          <label className="!m-0">
            Device name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work laptop"
              maxLength={80}
            />
          </label>
          <button type="submit" className="btn primary h-9" disabled={!name.trim()}>
            Generate profile
          </button>
        </form>
      )}

      <ul className="list-none p-0">
        {status?.devices.length === 0 && <EmptyListItem>No device profiles yet.</EmptyListItem>}
        {status?.devices.map((device) => (
          <li
            key={device.id}
            className={`${LIST_ITEM} ${device.connected ? "border-l-2 border-l-[var(--ok)] bg-[rgba(76,175,125,0.06)]" : ""}`}
          >
            <div className="flex min-w-0 flex-col gap-[0.15rem]">
              <span className="text-[0.9rem] font-semibold">{device.name}</span>
              <StatusBadge className={device.connected ? "!border-[rgba(76,175,125,0.45)] !text-[var(--ok)]" : ""}>
                {device.connected ? "CONNECTED" : "READY"}
              </StatusBadge>
              <span className="font-[var(--mono)] text-[0.78rem] text-[var(--ink-2)]">
                Created {new Date(device.createdAt * 1000).toLocaleDateString()}
              </span>
            </div>
            <div className="flex shrink-0 gap-[0.4rem]">
              <a
                className="btn ghost small no-underline"
                href={`/api/openvpn-server/devices/${device.id}/config`}
                download
              >
                <Download size={13} /> Download
              </a>
              <button type="button" className="btn danger small" onClick={() => revoke(device.id, device.name)}>
                <ShieldX size={13} /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
