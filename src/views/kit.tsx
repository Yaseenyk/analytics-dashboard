"use client";

import { useMemo, type ReactNode } from "react";
import { useGA, useGSC } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { GAFile, GSCFile, Cell, Series } from "@/lib/types";
import { AreaChart, Donut, Rank, type Item } from "@/components/charts";
import { DataTable, type TableProps } from "@/components/DataTable";
import { ErrorCard, Kpi, SkChart, SkKpi, SkTable } from "@/components/ui";

/** Compute from the GA4 file for the chosen range and site. Re-computes only when those change. */
export function useGaMemo<T>(build: (ga: GAFile, site: string, cmp: boolean) => T) {
  const f = useFilters();
  const e = useGA(f.range);
  const v = useMemo(() => (e.data ? build(e.data, f.site, f.cmp) : null), [e.data, f.site, f.cmp]); // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = !!e.data && !(e.data.reports?.totals?.rows?.length > 0);
  return { v, error: e.error && !e.data, f, waiting };
}
export function useGscMemo<T>(build: (g: GSCFile, site: string, cmp: boolean) => T) {
  const f = useFilters();
  const e = useGSC(f.range);
  const v = useMemo(() => (e.data ? build(e.data, f.site, f.cmp) : null), [e.data, f.site, f.cmp]); // eslint-disable-line react-hooks/exhaustive-deps
  return { v, error: e.error && !e.data, f };
}

type Opt<P> = Omit<P, "rows" | "items" | "series">;

const WAIT_MSG = "Waiting for Google to finish processing.";
export function GaTable({ build, ...p }: Opt<TableProps> & { build: (ga: GAFile, site: string) => Cell[][] }) {
  const { v, error, waiting } = useGaMemo((ga, site) => build(ga, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <DataTable {...p} empty={waiting ? WAIT_MSG : p.empty} rows={v} /> : <SkTable rows={Math.min(p.max ?? 5, 5)} />;
}
export function GscTable({ build, ...p }: Opt<TableProps> & { build: (g: GSCFile, site: string) => Cell[][] }) {
  const { v, error } = useGscMemo((g, site) => build(g, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <DataTable {...p} rows={v} /> : <SkTable rows={Math.min(p.max ?? 5, 5)} />;
}
export function GaRank({ build, ...p }: { title: string; max?: number; empty?: string; note?: ReactNode; build: (ga: GAFile, site: string) => Item[] }) {
  const { v, error, waiting } = useGaMemo((ga, site) => build(ga, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <Rank {...p} empty={waiting ? WAIT_MSG : p.empty} items={v} /> : <SkTable rows={4} />;
}
export function GscRank({ build, ...p }: { title: string; max?: number; empty?: string; note?: ReactNode; build: (g: GSCFile, site: string) => Item[] }) {
  const { v, error } = useGscMemo((g, site) => build(g, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <Rank {...p} items={v} /> : <SkTable rows={4} />;
}
export function GaDonut({ build, ...p }: { title: string; empty?: string; colorOf?: (n: string, i: number) => string; build: (ga: GAFile, site: string) => [string, number][] }) {
  const { v, error, waiting } = useGaMemo((ga, site) => build(ga, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <Donut {...p} empty={waiting ? WAIT_MSG : p.empty} items={v} /> : <SkChart />;
}
export function GaArea({ build, ...p }: { title: string; norm?: boolean; empty?: string; extra?: ReactNode; build: (ga: GAFile, site: string) => Series[] }) {
  const { v, error, waiting } = useGaMemo((ga, site) => build(ga, site));
  if (error) return <ErrorCard what={p.title} />;
  return v ? <AreaChart {...p} empty={waiting ? WAIT_MSG : p.empty} series={v} /> : <SkChart />;
}

export interface KpiCalc {
  value: ReactNode;
  delta?: ReactNode;
  spark?: number[];
  note?: ReactNode;
}
export function GaKpi({ title, id, color, calc }: { title: string; id: string; color?: string; calc: (ga: GAFile, site: string, cmp: boolean) => KpiCalc }) {
  const { v, error } = useGaMemo(calc);
  if (error) return <ErrorCard what={title} />;
  return v ? <Kpi title={title} id={id} color={color} value={v.value} delta={v.delta} spark={v.spark} note={v.note} /> : <SkKpi />;
}
export function GscKpi({ title, id, color, calc }: { title: string; id: string; color?: string; calc: (g: GSCFile, site: string, cmp: boolean) => KpiCalc }) {
  const { v, error } = useGscMemo(calc);
  if (error) return <ErrorCard what={title} />;
  return v ? <Kpi title={title} id={id} color={color} value={v.value} delta={v.delta} spark={v.spark} note={v.note} /> : <SkKpi />;
}

export const grid4 = "grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4";
export const cols2 = "grid grid-cols-1 items-stretch gap-4 md:grid-cols-2";

/** When Google has not finished processing the tags, one clear message replaces a page of empty blocks. */
export function WaitingGate({ children }: { children: ReactNode }) {
  const f = useFilters();
  const e = useGA(f.range);
  if (e.data && !(e.data.reports?.totals?.rows?.length > 0)) {
    return (
      <div className="card flex flex-col items-center px-6 py-10 text-center">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mb-3 h-9 w-9 fill-none stroke-brand" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
        </svg>
        <h2 className="h2">Google is still processing your new tags</h2>
        <p className="sub max-w-md">Visitor reports for this page appear about a day after a tag goes live. They fill in on their own, and the page checks Google every time you open it.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a className="pill on" href="/live/">See who is online now</a>
          <a className="pill" href="/search/">Search Console</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
