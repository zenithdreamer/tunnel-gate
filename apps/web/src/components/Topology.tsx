import {
  ArrowLeftRight,
  Cable,
  Crosshair,
  Globe2,
  LocateFixed,
  type LucideIcon,
  Network,
  RotateCcw,
  Router,
  Server,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Forward, OpenVpnServerStatus, Profile, Sample, TunnelStatus } from "../api";
import { fmtRate } from "../lib/format";
import { inCidr } from "../lib/ipv4";
import { PROFILE_TYPE_LABEL } from "../profiles/model";

interface Props {
  mode: "vpn" | "forwards";
  status: TunnelStatus | null;
  openVpnStatus: OpenVpnServerStatus | null;
  profiles: Profile[];
  forwards: Forward[];
  samples: Sample[];
}

type NodeState = "up" | "connecting" | "error" | "down" | "plain";

interface TopoNode {
  id: string;
  kind: "relay" | "server" | "fwd" | "route" | "tunnel" | "internet" | "target";
  title: string;
  sub: string[];
  state: NodeState;
  paths: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TopoEdge {
  id: string;
  from: string;
  to: string;
  cls: string;
  path: string;
  label?: string;
}

const NODE_ICON: Record<TopoNode["kind"], LucideIcon> = {
  relay: Router,
  server: Server,
  fwd: ArrowLeftRight,
  route: Network,
  tunnel: Cable,
  internet: Globe2,
  target: Crosshair,
};
const COL_X = [0, 230, 500, 770, 1080];
const NODE_W: Record<TopoNode["kind"], number> = {
  relay: 190,
  server: 230,
  fwd: 230,
  route: 230,
  tunnel: 260,
  internet: 200,
  target: 230,
};
const HEAD_H = 30;
const LINE_H = 15;
const ROW_GAP = 24;

const nodeH = (lines: number) => HEAD_H + lines * LINE_H + 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function Topology({ mode, status, openVpnStatus, profiles, forwards, samples }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewTouched = useRef(false);
  const drag = useRef<
    | { mode: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { mode: "node"; id: string; sx: number; sy: number; ox: number; oy: number }
    | null
  >(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const last = samples.at(-1);

  const { nodes, edges } = useMemo(() => {
    const graphForwards = mode === "forwards" ? forwards : [];
    const nodes: TopoNode[] = [];
    const edges: TopoEdge[] = [];
    const add = (node: Omit<TopoNode, "x" | "y" | "w" | "h">) => {
      const full = { ...node, x: 0, y: 0, w: NODE_W[node.kind], h: nodeH(node.sub.length) };
      nodes.push(full);
      return full;
    };
    const rate = (profileId: string) => {
      const value = last?.by?.[profileId];
      return value && (value.rx || value.tx) ? `down ${fmtRate(value.rx)} / up ${fmtRate(value.tx)}` : undefined;
    };

    const allPaths =
      mode === "vpn"
        ? ["openvpn-server"]
        : graphForwards.length
          ? graphForwards.map((forward) => forward.id)
          : ["forwards-empty"];
    const relay = add({
      id: "relay",
      kind: "relay",
      title: "TUNNEL GATE",
      sub:
        mode === "vpn"
          ? ["OpenVPN client ingress", `${profiles.length} outbound VPNs`]
          : [`${graphForwards.length} port forwards`, `${profiles.length} outbound VPNs`],
      state: "up",
      paths: allPaths,
    });
    const middle: TopoNode[] = [];
    const targets = new Map<string, TopoNode[]>();
    const tunnelNodes = new Map<string, TopoNode>();
    const openVpnRouteNodes = new Map<string, TopoNode[]>();

    for (const profile of profiles) {
      const tunnel = status?.tunnels.find((item) => item.profileId === profile.id);
      const state: NodeState =
        tunnel?.state === "connected"
          ? "up"
          : tunnel?.state === "connecting"
            ? "connecting"
            : tunnel?.state === "error"
              ? "error"
              : "down";
      const routes = tunnel?.routes.length ? tunnel.routes : profile.routes;
      const sub = [PROFILE_TYPE_LABEL[profile.type]];
      if (tunnel?.iface) sub.push(`${tunnel.iface} ${tunnel.addr ?? ""}`.trim());
      else sub.push(profile.summary);
      if (tunnel?.endpoint) sub.push(`peer ${tunnel.endpoint}`);
      for (const route of routes) sub.push(`route ${route}`);
      if (!routes.length) sub.push("no relay routes configured");
      const node = add({
        id: `tunnel:${profile.id}`,
        kind: "tunnel",
        title: profile.name,
        sub,
        state,
        paths: mode === "vpn" ? ["openvpn-server"] : [],
      });
      tunnelNodes.set(profile.id, node);
      const hasForward = graphForwards.some((forward) => routes.some((route) => inCidr(forward.targetHost, route)));
      if (mode === "vpn" || hasForward) {
        middle.push(node);
        targets.set(node.id, []);
      }
    }

    let direct: TopoNode | null = null;
    const listeners: TopoNode[] = [];
    const listenerAnchors = new Map<string, TopoNode>();
    const openVpnState: NodeState = openVpnStatus?.running ? "up" : openVpnStatus?.lastError ? "error" : "down";
    const openVpnNode = add({
      id: "openvpn-server",
      kind: "server",
      title: "OPENVPN SERVER",
      sub: [
        `${openVpnStatus?.host ?? "localhost"}:${openVpnStatus?.port ?? 1194}/udp`,
        `clients ${openVpnStatus?.connectedCommonNames.length ?? 0} · ${openVpnStatus?.subnet ?? "10.250.0.0/24"}`,
      ],
      state: openVpnState,
      paths: ["openvpn-server"],
    });
    if (mode === "vpn") {
      listeners.push(openVpnNode);
      edges.push({
        id: "in:openvpn-server",
        from: relay.id,
        to: openVpnNode.id,
        cls: `trunk t-${openVpnState}`,
        path: "openvpn-server",
      });
    }
    for (const profile of profiles) {
      const tunnelNode = tunnelNodes.get(profile.id)!;
      const tunnelInfo = status?.tunnels.find((item) => item.profileId === profile.id);
      const routes = tunnelInfo?.routes.length ? tunnelInfo.routes : profile.routes;
      if (!routes.length) continue;
      tunnelNode.paths.push("openvpn-server");
      const pathState = openVpnState === "up" ? tunnelNode.state : openVpnState;
      const visibleRoutes =
        mode === "vpn"
          ? routes
          : routes.filter((route) => graphForwards.some((forward) => inCidr(forward.targetHost, route)));
      const routeNodes = visibleRoutes.map((route, index) => {
        const routeNode = add({
          id: `openvpn-route:${profile.id}:${route}`,
          kind: "route",
          title: route,
          sub: [`via ${profile.name}`],
          state: tunnelNode.state,
          paths: mode === "vpn" ? ["openvpn-server"] : [],
        });
        if (mode === "vpn") {
          edges.push({
            id: `openvpn-route-in:${profile.id}:${index}`,
            from: openVpnNode.id,
            to: routeNode.id,
            cls: `fwd t-${pathState}`,
            path: "openvpn-server",
          });
          edges.push({
            id: `openvpn-route-out:${profile.id}:${index}`,
            from: routeNode.id,
            to: tunnelNode.id,
            cls: `fwd t-${pathState}`,
            path: "openvpn-server",
          });
        }
        return routeNode;
      });
      openVpnRouteNodes.set(tunnelNode.id, routeNodes);
    }
    for (const forward of graphForwards) {
      const match = profiles
        .map((profile) => {
          const tunnel = status?.tunnels.find((item) => item.profileId === profile.id);
          const cidr = (tunnel?.routes.length ? tunnel.routes : profile.routes).find((route) =>
            inCidr(forward.targetHost, route),
          );
          return cidr ? { profile, cidr } : null;
        })
        .find((item) => item !== null);
      if (!match && !direct) {
        direct = add({
          id: "internet",
          kind: "internet",
          title: "DIRECT UPLINK",
          sub: ["host default route", "outside VPN target routes"],
          state: "up",
          paths: [],
        });
        middle.push(direct);
        targets.set(direct.id, []);
      }
      const route = match ? tunnelNodes.get(match.profile.id)! : direct!;
      const cidrNode = match ? openVpnRouteNodes.get(route.id)?.find((node) => node.title === match.cidr) : undefined;
      route.paths.push(forward.id);
      cidrNode?.paths.push(forward.id);
      const state: NodeState = forward.enabled ? (forward.running ? "up" : "error") : "down";
      const routedState: NodeState = state !== "up" ? state : route.state;
      const listener = add({
        id: `fwd:${forward.id}`,
        kind: "fwd",
        title: forward.name,
        sub: [
          `listen :${forward.listenPort}/${forward.proto}`,
          `to ${forward.targetHost}:${forward.targetPort}`,
          forward.enabled ? "enabled" : "disabled",
        ],
        state,
        paths: [forward.id],
      });
      const target = add({
        id: `target:${forward.id}`,
        kind: "target",
        title: `${forward.targetHost}:${forward.targetPort}`,
        sub: [`${forward.proto.toUpperCase()} target`, `from relay :${forward.listenPort}`],
        state: routedState,
        paths: [forward.id],
      });
      listeners.push(listener);
      listenerAnchors.set(listener.id, cidrNode ?? route);
      targets.get(route.id)!.push(target);
      edges.push({
        id: `in:${forward.id}`,
        from: relay.id,
        to: listener.id,
        cls: `trunk t-${state}`,
        path: forward.id,
      });
      edges.push({
        id: `route:${forward.id}`,
        from: listener.id,
        to: cidrNode?.id ?? route.id,
        cls: `fwd t-${routedState}`,
        path: forward.id,
      });
      if (cidrNode) {
        edges.push({
          id: `route-vpn:${forward.id}`,
          from: cidrNode.id,
          to: route.id,
          cls: `fwd t-${routedState}`,
          path: forward.id,
        });
      }
      edges.push({
        id: `target:${forward.id}`,
        from: route.id,
        to: target.id,
        cls: `fwd t-${routedState}`,
        path: forward.id,
        label: match ? rate(match.profile.id) : undefined,
      });
    }

    let middleY = 0;
    for (const node of middle) {
      const children = targets.get(node.id) ?? [];
      const routeNodes = openVpnRouteNodes.get(node.id) ?? [];
      const routesH = routeNodes.length
        ? routeNodes.reduce((sum, routeNode) => sum + routeNode.h, 0) + 10 * (routeNodes.length - 1)
        : 0;
      const childrenH = children.length
        ? children.reduce((sum, child) => sum + child.h, 0) + ROW_GAP * (children.length - 1)
        : 0;
      const blockH = Math.max(node.h, routesH, childrenH);
      node.x = COL_X[3];
      node.y = middleY + (blockH - node.h) / 2;
      let routeY = middleY + (blockH - routesH) / 2;
      for (const routeNode of routeNodes) {
        routeNode.x = COL_X[2];
        routeNode.y = routeY;
        routeY += routeNode.h + 10;
      }
      let childY = middleY + (blockH - childrenH) / 2;
      for (const child of children) {
        child.x = COL_X[4];
        child.y = childY;
        childY += child.h + ROW_GAP;
      }
      middleY += blockH + ROW_GAP;
    }

    const middleH = middleY ? middleY - ROW_GAP : 0;
    const routeNodes = [...openVpnRouteNodes.values()].flat();
    const routeCenter = routeNodes.length
      ? (Math.min(...routeNodes.map((node) => node.y)) + Math.max(...routeNodes.map((node) => node.y + node.h))) / 2
      : middleH / 2;
    const orderedListeners = listeners
      .map((listener) => {
        const anchor = listenerAnchors.get(listener.id);
        const center = listener === openVpnNode ? routeCenter : anchor ? anchor.y + anchor.h / 2 : middleH / 2;
        return { listener, desiredY: center - listener.h / 2 };
      })
      .sort((a, b) => a.desiredY - b.desiredY);
    let listenerBottom = 0;
    for (const { listener, desiredY } of orderedListeners) {
      listener.x = COL_X[1];
      listener.y = Math.max(desiredY, listenerBottom);
      listenerBottom = listener.y + listener.h + ROW_GAP;
    }
    const totalH = Math.max(middleH, listenerBottom ? listenerBottom - ROW_GAP : 0, relay.h);
    relay.x = COL_X[0];
    relay.y = totalH / 2 - relay.h / 2;
    const selectedPaths = new Set(allPaths);
    return {
      nodes: nodes.filter((node) => node.paths.some((path) => selectedPaths.has(path))),
      edges: edges.filter((edge) => selectedPaths.has(edge.path)),
    };
  }, [forwards, last, mode, openVpnStatus, profiles, status]);

  const placed = useMemo(
    () => nodes.map((node) => (overrides[node.id] ? { ...node, ...overrides[node.id] } : node)),
    [nodes, overrides],
  );
  const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);
  const fit = useCallback(() => {
    const element = wrapRef.current;
    if (!element || !placed.length) return;
    const xs = placed.flatMap((node) => [node.x, node.x + node.w]);
    const ys = placed.flatMap((node) => [node.y, node.y + node.h]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const bounds = element.getBoundingClientRect();
    const k = clamp(
      Math.min((bounds.width - 60) / Math.max(width, 1), (bounds.height - 60) / Math.max(height, 1)),
      0.3,
      1,
    );
    setView({ x: (bounds.width - width * k) / 2 - minX * k, y: (bounds.height - height * k) / 2 - minY * k, k });
  }, [placed]);

  useEffect(() => {
    if (!viewTouched.current && placed.length) fit();
  }, [fit, placed.length]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      viewTouched.current = true;
      const rect = element.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setView((current) => {
        const k = clamp(current.k * Math.exp(-event.deltaY * 0.0014), 0.3, 2.5);
        return { k, x: mx - ((mx - current.x) / current.k) * k, y: my - ((my - current.y) / current.k) * k };
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  function pointerDown(event: React.PointerEvent) {
    viewTouched.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode: "pan", sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y };
  }

  function nodeDown(event: React.PointerEvent, node: TopoNode) {
    event.stopPropagation();
    viewTouched.current = true;
    (event.currentTarget.closest("svg") as SVGSVGElement).setPointerCapture(event.pointerId);
    drag.current = { mode: "node", id: node.id, sx: event.clientX, sy: event.clientY, ox: node.x, oy: node.y };
  }

  function pointerMove(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    if (current.mode === "pan")
      setView((value) => ({
        ...value,
        x: current.ox + event.clientX - current.sx,
        y: current.oy + event.clientY - current.sy,
      }));
    else
      setOverrides((value) => ({
        ...value,
        [current.id]: {
          x: current.ox + (event.clientX - current.sx) / view.k,
          y: current.oy + (event.clientY - current.sy) / view.k,
        },
      }));
  }

  function pointerUp() {
    drag.current = null;
  }

  function zoom(factor: number) {
    const element = wrapRef.current;
    if (!element) return;
    viewTouched.current = true;
    const { width, height } = element.getBoundingClientRect();
    setView((current) => {
      const k = clamp(current.k * factor, 0.3, 2.5);
      return {
        k,
        x: width / 2 - ((width / 2 - current.x) / current.k) * k,
        y: height / 2 - ((height / 2 - current.y) / current.k) * k,
      };
    });
  }

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        className="block h-[480px] w-full cursor-grab touch-none select-none border border-[var(--line)] bg-[var(--bg)] active:cursor-grabbing"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        role="img"
        aria-label="Tunnel gate topology"
      >
        <defs>
          <pattern id="topo-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" className="topo-grid-dot" />
          </pattern>
        </defs>
        <rect className="topo-bg" width="100%" height="100%" fill="url(#topo-grid)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + from.w;
            const y1 = from.y + from.h / 2;
            const x2 = to.x;
            const y2 = to.y + to.h / 2;
            const curve = Math.max(40, (x2 - x1) / 2);
            return (
              <g
                key={edge.id}
                className={`tedge ${edge.cls}${activePath && activePath !== edge.path ? " is-muted" : ""}`}
              >
                <path d={`M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`} />
                {edge.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="tedge-label">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {placed.map((node) => {
            const muted = activePath && !node.paths.includes(activePath);
            const ownPath = node.paths.length === 1 ? node.paths[0] : null;
            const Icon = NODE_ICON[node.kind];
            return (
              <g
                key={node.id}
                className={`tnode ${node.kind} st-${node.state}${muted ? " is-muted" : ""}`}
                transform={`translate(${node.x},${node.y})`}
                onPointerDown={(event) => nodeDown(event, node)}
                onPointerEnter={() => ownPath && setActivePath(ownPath)}
                onPointerLeave={() => ownPath && setActivePath(null)}
              >
                <rect className="tnode-box" width={node.w} height={node.h} />
                <rect className="tnode-stripe" width={3} height={node.h} />
                {node.state === "connecting" ? (
                  <g className="tnode-spinner">
                    <circle className="tnode-spinner-track" cx={16} cy={15} r={6} />
                    <circle className="tnode-spinner-arc" cx={16} cy={15} r={6} />
                  </g>
                ) : (
                  <circle className="tnode-led" cx={16} cy={15} r={4} />
                )}
                <Icon className="tnode-icon" x={31} y={8} width={14} height={14} />
                <text className="tnode-title" x={52} y={19}>
                  {node.title}
                </text>
                {node.sub.map((line, index) => (
                  <text key={line} className="tnode-sub" x={16} y={HEAD_H + 10 + index * LINE_H}>
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute top-[10px] right-[10px] flex flex-col gap-[0.3rem] [&_.btn]:bg-[var(--surface)]">
        <button
          type="button"
          className="btn small ghost"
          onClick={() => zoom(1.25)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => zoom(0.8)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button type="button" className="btn small ghost" onClick={fit} title="Fit to view" aria-label="Fit to view">
          <LocateFixed size={14} />
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            viewTouched.current = false;
            setOverrides({});
            requestAnimationFrame(fit);
          }}
          title="Auto arrange"
          aria-label="Auto arrange"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="mt-[0.55rem] flex flex-wrap items-center gap-4 text-[0.78rem] text-[var(--ink-2)]">
        <span>
          <i className="mr-[0.35rem] inline-block size-[7px] rounded-full bg-[var(--ok)] shadow-[0_0_6px_var(--ok)]" />{" "}
          active
        </span>
        <span>
          <i className="mr-[0.35rem] inline-block size-[7px] rounded-full bg-[var(--accent)]" /> connecting
        </span>
        <span>
          <i className="mr-[0.35rem] inline-block size-[7px] rounded-full bg-[var(--bad)]" /> error
        </span>
        <span>
          <i className="mr-[0.35rem] inline-block size-[7px] rounded-full bg-[var(--ink-3)]" /> unavailable
        </span>
        <span className="ml-auto text-[var(--ink-2)]">
          nodes and lines share status colors · hover a port or target to trace its path
        </span>
      </div>
    </div>
  );
}
