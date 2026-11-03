"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { BRAND, COLORS } from "@/lib/config";
import { n, pct } from "@/lib/derive";
import type { Series } from "@/lib/types";
import { Card, Empty } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dlabel(d: string, long?: boolean) {
  const p = d.split("-");
  if (p.length < 3) return d;
  const mo = MONTHS[+p[1] - 1];
  return long ? `${mo} '${p[0].slice(2)}` : `${+p[2]} ${mo}`;
}
function valfmt(v: number, f?: string) {
  return f === "p" ? v.toFixed(1) + "%" : f === "pos" ? v.toFixed(1) : n(v);
}
function niceMax(v: number) {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(240, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Line and area chart drawn at its real width so text stays readable on phones. */
export function AreaChart({ title, series, norm, extra, empty = "Nothing here yet.", note }: { title: string; series: Series[]; norm?: boolean; extra?: ReactNode; empty?: string; note?: ReactNode }) {
  const gid = useId().replace(/:/g, "");
  const [ref, W] = useWidth();
  const [hov, setHov] = useState<number | null>(null);
  const xs = useMemo(() => {
    const d: Record<string, 1> = {};
    series.forEach((s) => s.pts.forEach((p) => (d[p[0]] = 1)));
    return Object.keys(d).sort();
  }, [series]);
  const maps = useMemo(() => series.map((s) => Object.fromEntries(s.pts)), [series]);
  if (!xs.length || !series.length) return <Card title={title} extra={extra}><Empty msg={empty} /></Card>;

  const small = W < 480;
  const H = small ? 170 : 210;
  const P = { l: norm ? 6 : small ? 34 : 42, r: 8, t: 10, b: 24 };
  const mxs = series.map((s) => Math.max(1, ...s.pts.map((p) => p[1])));
  const gmx = niceMax(Math.max(...mxs));
  const X = (i: number) => P.l + (xs.length > 1 ? (i * (W - P.l - P.r)) / (xs.length - 1) : (W - P.l - P.r) / 2);
  const Y = (v: number, si: number) => P.t + (H - P.t - P.b) * (1 - v / (norm ? mxs[si] : gmx));
  const long = xs.length > 100;
  const ticks = norm ? [] : [0, 1, 2, 3, 4].map((k) => (gmx * k) / 4);
  const xl = Array.from(new Set(Array.from({ length: small ? 4 : 6 }, (_, k) => Math.round((k * (xs.length - 1)) / ((small ? 4 : 6) - 1)))));
  const color = (s: Series, i: number) => s.color || COLORS[i % COLORS.length];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - P.l) / (W - P.l - P.r)) * (xs.length - 1));
    setHov(Math.max(0, Math.min(xs.length - 1, i)));
  };

  return (
    <Card title={title} extra={extra} note={note}>
      <div ref={ref} className="relative mt-3 select-none">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="block max-w-full touch-pan-y" onPointerMove={onMove} onPointerLeave={() => setHov(null)}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gid}-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: color(s, i) }} stopOpacity={series.length > 2 ? 0.08 : 0.2} />
                <stop offset="1" style={{ stopColor: color(s, i) }} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={P.l} x2={W - P.r} y1={Y(t, 0)} y2={Y(t, 0)} stroke="rgba(255,255,255,.06)" />
              <text x={P.l - 6} y={Y(t, 0) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--dim)">{n(t)}</text>
            </g>
          ))}
          {norm && <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="rgba(255,255,255,.08)" />}
          {xl.map((i) => (
            <text key={i} x={X(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === xs.length - 1 ? "end" : "middle"} fontSize="10.5" fill="var(--dim)">{dlabel(xs[i], long)}</text>
          ))}
          {series.map((s, si) => {
            const pts = xs.map((d, i) => [X(i), Y(maps[si][d] ?? 0, si)] as const);
            const line = pts.map((p) => p.join(",")).join(" ");
            return (
              <g key={si}>
                <polygon fill={`url(#${gid}-${si})`} points={`${P.l},${H - P.b} ${line} ${X(xs.length - 1)},${H - P.b}`} />
                <polyline fill="none" style={{ stroke: color(s, si) }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line} />
              </g>
            );
          })}
          {hov !== null && (
            <g>
              <line x1={X(hov)} x2={X(hov)} y1={P.t} y2={H - P.b} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
              {series.map((s, si) => (
                <circle key={si} cx={X(hov)} cy={Y(maps[si][xs[hov]] ?? 0, si)} r="4" style={{ fill: color(s, si) }} stroke="#000" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {hov !== null && (
          <div className="pointer-events-none absolute top-1 z-10 min-w-[120px] rounded-xl border border-line2 bg-card2/95 px-3 py-2 text-[12px] shadow-xl backdrop-blur" style={{ left: Math.min(Math.max(X(hov) + 12, 4), W - 150) }}>
            <div className="mb-1 font-mono text-[11px] text-dim">{dlabel(xs[hov])}</div>
            {series.map((s, si) => (
              <div key={si} className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full" style={{ background: color(s, si) }} />
                <span className="text-mute">{s.name}</span>
                <b className="ml-auto pl-3">{valfmt(maps[si][xs[hov]] ?? 0, s.fmt)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
          {series.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: color(s, si) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export type Item = [string, number, string?];

export function Rank({ title, items, max = 7, empty = "Nothing here yet.", note }: { title: string; items: Item[]; max?: number; empty?: string; note?: ReactNode }) {
  const top = Math.max(1, ...items.map((i) => i[1]));
  return (
    <Card title={title} note={note}>
      {items.length ? (
        <div className="mt-3 space-y-2.5">
          {items.slice(0, max).map((i) => (
            <div key={i[0]} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              <span className="truncate text-[13px]" title={i[0]}>{i[0]}</span>
              <span className="font-mono text-[12px] text-mute">{i[2] ?? n(i[1])}</span>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (100 * i[1]) / top)}%`, background: BRAND }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty msg={empty} />
      )}
    </Card>
  );
}

export function Donut({ title, items, colorOf, empty = "Nothing here yet." }: { title: string; items: [string, number][]; colorOf?: (name: string, i: number) => string; empty?: string }) {
  const tot = items.reduce((s, i) => s + i[1], 0);
  if (!tot) return <Card title={title}><Empty msg={empty} /></Card>;
  const top = items.slice(0, 6) as [string, number][];
  const rest = items.slice(6).reduce((s, i) => s + i[1], 0);
  if (rest) top.push(["Other", rest]);
  const cof = colorOf ?? ((_: string, i: number) => COLORS[i % COLORS.length]);
  let off = 25;
  return (
    <Card title={title} className="flex flex-col">
      <div className="my-auto flex flex-col items-center gap-5 pt-3 sm:flex-row">
        <svg viewBox="0 0 42 42" role="img" aria-label={title} className="h-[140px] w-[140px] flex-none">
          <circle r="15.9155" cx="21" cy="21" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="5" />
          {top.map((it, i) => {
            const p = (100 * it[1]) / tot;
            const el = (
              <circle key={it[0]} r="15.9155" cx="21" cy="21" fill="none" style={{ stroke: cof(it[0], i) }} strokeWidth="5" strokeDasharray={`${p.toFixed(2)} ${(100 - p).toFixed(2)}`} strokeDashoffset={off.toFixed(2)}>
                <title>{`${it[0]}: ${n(it[1])}`}</title>
              </circle>
            );
            off -= p;
            return el;
          })}
          <text x="21" y="22.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--text)">{n(tot)}</text>
        </svg>
        <ul className="w-full min-w-0 flex-1 space-y-2 text-[12.5px]">
          {top.map((it, i) => (
            <li key={it[0]} className="flex items-center gap-2">
              <i className="h-2 w-2 flex-none rounded-full" style={{ background: cof(it[0], i) }} />
              <span className="truncate text-mute">{it[0]}</span>
              <span className="ml-auto whitespace-nowrap font-mono text-[12px]">{n(it[1])} <span className="text-dim">({pct(it[1], tot).toFixed(0)}%)</span></span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
