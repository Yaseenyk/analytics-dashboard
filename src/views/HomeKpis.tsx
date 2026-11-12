"use client";

import Link from "next/link";
import { useMemo } from "react";
import { COLORS, SITES, SITE_HOSTS, gscProperty } from "@/lib/config";
import { useGA, useGSC } from "@/lib/data";
import { dailyTotal, gscDaily, gscMerge, gscTotals, group, hasGA, n, rep, sum } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { metricByHost } from "@/lib/today";
import { GLOSSARY } from "@/lib/glossary";
import type { GAFile, GSCFile } from "@/lib/types";
import { PopBox } from "@/components/Pop";
import { Delta, Sk, Spark } from "@/components/ui";

type Key = "people" | "visits" | "leads" | "clicks";
const META: Record<Key, { title: string; help: string; color: string; link: [string, string]; met?: string }> = {
  people: { title: "People", help: "people", color: COLORS[0], link: ["/sources/", "See where they came from"], met: "activeUsers" },
  visits: { title: "Visits", help: "visits", color: COLORS[1], link: ["/pages/", "See the most visited pages"], met: "sessions" },
  leads: { title: "Leads and clicks", help: "leads", color: COLORS[2], link: ["/leads/", "See every action"], met: "keyEvents" },
  clicks: { title: "Google clicks", help: "clicks", color: COLORS[3], link: ["/search/", "Open Search Console numbers"] },
};

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0 truncate">{label}</span><b className="font-mono text-[13px]">{n(value)}</b></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><i className="block h-full rounded-full bg-brand" style={{ width: `${max ? Math.max(4, (100 * value) / max) : 0}%` }} /></div>
    </li>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim">{children}</h3>;

interface Calc { value: number; prev: number; spark: number[]; by: { name: string; v: number }[]; extra?: { title: string; rows: [string, number][] } }

function calc(k: Key, ga: GAFile | null | undefined, gsc: GSCFile | null | undefined, site: string): Calc | null {
  if (k === "clicks") {
    if (!gsc) return null;
    const a = gscTotals(gsc, site, false), b = gscTotals(gsc, site, true);
    const hosts = site === "all" ? SITE_HOSTS : [site];
    const by = hosts.map((h) => ({ name: SITES[h], v: gsc.search?.[gscProperty(h)]?.ok ? +(gsc.search[gscProperty(h)].total?.[0] ?? 0) : 0 })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v);
    const q = gscMerge(gsc, site, "queries", 1).slice(0, 6).map((r) => [String(r[0]), +r[1] || 0] as [string, number]);
    return { value: a.clicks, prev: b.clicks, spark: gscDaily(gsc, site).map((x) => x.clicks), by, extra: { title: "Top searches", rows: q } };
  }
  if (!ga || !hasGA(ga)) return null;
  const m = META[k].met!;
  const t = rep(ga, "totals"), tp = rep(ga, "totalsPrev");
  const by = Object.entries(metricByHost(ga, m)).filter(([h]) => SITES[h] && (site === "all" || h === site)).map(([h, v]) => ({ name: SITES[h], v })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v);
  const out: Calc = { value: sum(t, m, site), prev: sum(tp, m, site), spark: dailyTotal(rep(ga, "daily"), m, site), by };
  if (k === "leads") out.extra = { title: "What they did", rows: group(rep(ga, "events"), [1], site).slice(0, 6).map((x) => [x.k[0].replace(/_/g, " "), x.m[0]] as [string, number]) };
  return out;
}

function Sheet({ k, c, days }: { k: Key; c: Calc; days: number }) {
  const meta = META[k];
  const change = c.prev > 0 ? Math.round((100 * (c.value - c.prev)) / c.prev) : null;
  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute">
        <b className="text-[30px] text-ink">{n(c.value)}</b>{" "}
        {change === null ? `in the last ${days} days.` : change === 0 ? `in the last ${days} days, the same as before.` : `in the last ${days} days, ${change > 0 ? "up" : "down"} ${Math.abs(change)}% on the ${days} days before.`}
      </p>
      <p className="m-0 mt-3 rounded-2xl bg-white/[.04] p-3.5 text-[14px] leading-relaxed text-mute"><b className="text-ink">What it means. </b>{GLOSSARY[meta.help].plain}</p>
      <H>By site</H>
      <ul className="m-0 list-none p-0">{c.by.length ? c.by.map((x) => <Bar key={x.name} label={x.name} value={x.v} max={c.by[0].v} />) : <li className="text-[14px] text-dim">Nothing yet.</li>}</ul>
      {c.extra && c.extra.rows.length > 0 && (<><H>{c.extra.title}</H><ul className="m-0 list-none p-0">{c.extra.rows.map(([name, v]) => <Bar key={name} label={name} value={v} max={c.extra!.rows[0][1] || 1} />)}</ul></>)}
      <Link href={meta.link[0]} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-brand/10 text-[14px] font-semibold text-brand">{meta.link[1]}</Link>
    </div>
  );
}

/** The four big numbers on Home. Tap one to see which site it came from and what is behind it. */
export default function HomeKpis() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
  const days = ga?.days ?? gsc?.days ?? 28;
  const all = useMemo(() => (["people", "visits", "leads", "clicks"] as Key[]).map((k) => [k, calc(k, ga, gsc, f.site)] as const), [ga, gsc, f.site]);
  return (
    <div className="grid grid-cols-2 gap-3">
      {all.map(([k, c]) => {
        const meta = META[k];
        if (!c) return <div key={k} className="card !p-3.5"><div className="text-[12.5px] text-mute">{meta.title}</div><Sk w={50} h={26} className="mt-2" /></div>;
        return (
          <PopBox key={k} id={`kpi-${k}`} title={meta.title} className="card w-full !border-transparent !p-3.5" label={`${meta.title}: ${n(c.value)}`} render={() => <Sheet k={k} c={c} days={days} />}>
            <div className="text-[12.5px] text-mute">{meta.title}</div>
            <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight">{n(c.value)}</div>
            <Delta show={f.cmp} cur={c.value} prev={c.prev} />
            <Spark vals={c.spark} color={meta.color} id={`hk-${k}`} />
          </PopBox>
        );
      })}
    </div>
  );
}
