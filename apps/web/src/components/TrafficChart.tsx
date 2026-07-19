import { useRef, useState } from "react";
import { fmtRate, niceMax } from "../lib/format";
import type { TrafficPoint } from "../lib/traffic";

const W = 760;
const H = 220;
const PAD = { l: 56, r: 70, t: 12, b: 26 };

export function TrafficChart({ samples }: { samples: TrafficPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(1024, ...samples.flatMap((sample) => [sample.rx, sample.tx])));
  const t0 = samples[0]?.t ?? 0;
  const t1 = samples.at(-1)?.t ?? 1;

  const xOf = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const yOf = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);

  const points = (key: "rx" | "tx") =>
    samples
      .map((sample, index) => `${index === 0 ? "M" : "L"}${xOf(sample.t).toFixed(1)},${yOf(sample[key]).toFixed(1)}`)
      .join("");
  const area = (line: string) =>
    samples.length > 1
      ? `${line}L${xOf(t1).toFixed(1)},${(H - PAD.b).toFixed(1)}L${xOf(t0).toFixed(1)},${(H - PAD.b).toFixed(1)}Z`
      : "";
  const rxLine = points("rx");
  const txLine = points("tx");
  const rxArea = area(rxLine);
  const txArea = area(txLine);

  const xTicks =
    t1 - t0 < 10_000
      ? []
      : [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const t = t0 + (t1 - t0) * fraction;
          return {
            x: xOf(t),
            label: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          };
        });

  function onMove(e: React.MouseEvent) {
    if (!svgRef.current || samples.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    samples.forEach((s, i) => {
      const d = Math.abs(xOf(s.t) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  }

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => ({ y: yOf(max * f), v: max * f }));
  const h = hover !== null ? samples[hover] : null;
  const lastSample = samples.at(-1);
  const hFrac = h ? xOf(h.t) / W : 0;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Tunnel receive and transmit rate over time"
      >
        {gridLines.map((g) => (
          <g key={g.y}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.y} y2={g.y} className="gridline" />
            <text x={PAD.l - 8} y={g.y + 3} className="axis-label" textAnchor="end">
              {fmtRate(g.v)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
        {xTicks.map((tk) => (
          <text key={tk.x} x={tk.x} y={H - 8} className="axis-label" textAnchor="middle">
            {tk.label}
          </text>
        ))}

        {samples.length > 1 && (
          <>
            <path d={rxArea} className="area rx" />
            <path d={txArea} className="area tx" />
            <path d={rxLine} className="series rx" />
            <path d={txLine} className="series tx" />
            {lastSample && (
              <>
                <text x={W - PAD.r + 8} y={yOf(lastSample.rx) + 3} className="direct-label rx">
                  RX
                </text>
                <text x={W - PAD.r + 8} y={yOf(lastSample.tx) + 3} className="direct-label tx">
                  TX
                </text>
              </>
            )}
          </>
        )}

        {h && (
          <g>
            <line x1={xOf(h.t)} x2={xOf(h.t)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
            <circle cx={xOf(h.t)} cy={yOf(h.rx)} r={4} className="dot rx" />
            <circle cx={xOf(h.t)} cy={yOf(h.tx)} r={4} className="dot tx" />
          </g>
        )}

        {samples.length < 2 && (
          <text x={W / 2} y={H / 2} className="axis-label" textAnchor="middle">
            No link traffic. Connect a tunnel to begin.
          </text>
        )}
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute top-[10px] z-2 grid gap-[0.2rem] whitespace-nowrap rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-[0.6rem] py-[0.45rem] text-[0.75rem] text-[var(--ink-2)] [&_b]:ml-[0.3rem] [&_b]:font-[var(--mono)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
          style={{
            left: `${hFrac * 100}%`,
            transform: hFrac > 0.72 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <div className="font-[var(--mono)] text-[0.7rem] text-[var(--ink-3)]">
            {new Date(h.t).toLocaleTimeString()}
          </div>
          <div>
            <i className="mr-[0.35rem] inline-block h-[3px] w-[14px] bg-[var(--rx)] align-middle" /> RX{" "}
            <b>{fmtRate(h.rx)}</b>
          </div>
          <div>
            <i className="mr-[0.35rem] inline-block h-[3px] w-[14px] bg-[var(--tx)] align-middle" /> TX{" "}
            <b>{fmtRate(h.tx)}</b>
          </div>
        </div>
      )}

      <div className="mt-[0.4rem] flex items-center gap-[1.2rem] text-[0.75rem] text-[var(--ink-2)]">
        <span>
          <i className="mr-[0.35rem] inline-block h-[3px] w-[14px] bg-[var(--rx)] align-middle" /> RX (from VPN)
        </span>
        <span>
          <i className="mr-[0.35rem] inline-block h-[3px] w-[14px] bg-[var(--tx)] align-middle" /> TX (to VPN)
        </span>
      </div>
    </div>
  );
}
