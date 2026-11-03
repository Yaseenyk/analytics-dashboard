"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { BRAND, ICONS } from "@/lib/config";

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} flex-none fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

/* ---- skeletons: every block draws its own while its data is on the way ---------------- */
export const Sk = ({ w = 100, h = 12, className = "" }: { w?: number | string; h?: number; className?: string }) => (
  <i className={`sk block ${className}`} style={{ width: typeof w === "number" ? `${w}%` : w, height: h }} />
);
export function SkCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`} role="status" aria-label="Loading">
      {children}
    </div>
  );
}
export const SkKpi = ({ spark = true }: { spark?: boolean }) => (
  <SkCard className="space-y-3">
    <Sk w={38} h={10} />
    <Sk w={52} h={28} />
    <Sk w={24} h={10} />
    {spark && <Sk w={100} h={26} />}
  </SkCard>
);
export const SkChart = ({ title = true }: { title?: boolean }) => (
  <SkCard>
    {title && <Sk w={30} h={14} className="mb-4" />}
    <div className="flex h-[190px] items-end gap-1.5">
      {[45, 62, 52, 70, 58, 80, 66, 90, 74, 60, 84, 70].map((h, i) => (
        <i key={i} className="sk block flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  </SkCard>
);
export const SkTable = ({ rows = 5 }: { rows?: number }) => (
  <SkCard className="space-y-2.5">
    <Sk w={34} h={14} />
    <Sk w={100} h={34} className="!rounded-[10px]" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="grid grid-cols-[2fr_1fr_1fr] gap-3">
        <Sk h={12} />
        <Sk h={12} />
        <Sk h={12} />
      </div>
    ))}
  </SkCard>
);
export const SkText = () => (
  <SkCard className="space-y-2.5">
    <Sk w={28} h={14} />
    <Sk w={92} />
    <Sk w={78} />
    <Sk w={86} />
    <Sk w={64} />
  </SkCard>
);

/* ---- small pieces ----------------------------------------------------------------------- */
export function Delta({ cur, prev, invert, show }: { cur: number; prev: number; invert?: boolean; show: boolean }) {
  if (!show || !prev) return null;
  const p = (100 * (cur - prev)) / prev;
  const flat = Math.abs(p) < 1;
  const good = invert ? p < 0 : p > 0;
  const tone = flat ? "bg-white/5 text-dim" : good ? "bg-good/10 text-good" : "bg-bad/10 text-bad";
  return (
    <span className={`mt-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${tone}`}>
      {p > 0 ? "▲ " : p < 0 ? "▼ " : ""}
      {Math.abs(p).toFixed(0)}%
    </span>
  );
}

export function Spark({ vals, color = BRAND, id }: { vals: number[]; color?: string; id: string }) {
  if (!vals || vals.length < 2) return null;
  const mx = Math.max(...vals) || 1;
  const mn = Math.min(...vals);
  const pts = vals.map((v, i) => `${((i * 100) / (vals.length - 1)).toFixed(1)},${(27 - (24 * (v - mn)) / (mx - mn || 1)).toFixed(1)}`);
  return (
    <svg className="mt-2.5 h-[30px] w-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: color }} stopOpacity=".22" />
          <stop offset="1" style={{ stopColor: color }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,30 ${pts.join(" ")} 100,30`} />
      <polyline fill="none" style={{ stroke: color }} strokeWidth="1.6" vectorEffect="non-scaling-stroke" points={pts.join(" ")} />
    </svg>
  );
}

export function Kpi({ title, value, delta, spark, color, id, note }: { title: string; value: ReactNode; delta?: ReactNode; spark?: number[]; color?: string; id: string; note?: ReactNode }) {
  return (
    <div className="card animate-fadein !p-3.5 sm:!p-5">
      <div className="truncate text-[12px] text-mute sm:text-[12.5px]">{title}</div>
      <div className="mt-1 text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">{value}</div>
      {delta}
      {note}
      {spark && <Spark vals={spark} color={color} id={`sp-${id}`} />}
    </div>
  );
}

export const Wait = () => <span className="mt-1.5 inline-block font-mono text-[11px] text-dim">Waiting for data</span>;

export function Empty({ msg }: { msg: string }) {
  return <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-dim">{msg}</div>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-[13px] text-amber-100/90">
      <span aria-hidden="true">⏳</span>
      <span>{children}</span>
    </div>
  );
}

export function Card({ title, note, extra, children, className = "", style }: { title?: string; note?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`card animate-fadein ${className}`} style={style}>
      {(title || extra) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="h2">{title}</h2>}
          {extra}
        </div>
      )}
      {note && <p className="sub">{note}</p>}
      {children}
    </section>
  );
}

export function ErrorCard({ what }: { what: string }) {
  return (
    <div className="card">
      <h2 className="h2">Could not load {what}</h2>
      <p className="sub">That data file is not published yet. The next refresh adds it.</p>
    </div>
  );
}
