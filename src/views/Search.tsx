"use client";

import { Term } from "@/components/Term";
import { useMemo, useState } from "react";
import { COLORS, DEFAULT_RANGES } from "@/lib/config";
import { useBing, useGSC } from "@/lib/data";
import { bingDaily, bingList, bingMerge, bingTotals, gscDaily, gscList, gscMerge, gscMissing, gscTotals, label, n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import type { Cell, Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Card, Delta, Empty, ErrorCard, Kpi, SkChart, SkKpi, SkTable } from "@/components/ui";
import { grid4 } from "./kit";

type Metric = "clicks" | "impr" | "ctr" | "pos";
const DIMS: [string, string][] = [["queries", "Queries"], ["pages", "Pages"], ["countries", "Countries"], ["devices", "Devices"], ["daily", "Dates"], ["queryPage", "Query on page"]];
const TOP: Record<string, string> = { queries: "Top queries", pages: "Top pages", countries: "Countries", devices: "Devices", daily: "Dates", queryPage: "Top queries on pages" };
/** The four metric tiles take Search Console's colours so the report reads the same. */
const GSC_COLOR: Record<Metric, string> = { clicks: "#4285f4", impr: "#7e57c2", ctr: "#0f9d58", pos: "#f29900" };
const DIM_LABEL: Record<string, string> = { queries: "Query", pages: "Page", countries: "Country", devices: "Device" };

function GoogleSearch() {
  const f = useFilters();
  const e = useGSC(f.range);
  const [sm, setSm] = useState<Record<Metric, boolean>>({ clicks: true, impr: true, ctr: false, pos: false });
  const [dim, setDim] = useState("queries");
  const g = e.data;
  const calc = useMemo(() => {
    if (!g) return null;
    return { list: gscList(g, f.site), a: gscTotals(g, f.site, false), b: gscTotals(g, f.site, true), gd: gscDaily(g, f.site), missing: gscMissing(g, f.site) };
  }, [g, f.site]);

  const table = useMemo(() => {
    if (!g || !calc) return null;
    const o = { fmt: [0, "n", "n", "p", "pos"] as (0 | "n" | "p" | "pos")[], bar: 1 as number | undefined, sort: undefined as number | undefined, cols: [] as string[], rows: [] as Cell[][] };
    if (dim === "queryPage") {
      o.rows = gscMerge(g, f.site, "queryPage", 2);
      o.cols = ["Query", "Page", "Clicks", "Impressions", "CTR", "Position"];
      o.fmt = [0, 0, "n", "n", "p", "pos"];
      o.bar = undefined;
      o.sort = 2;
    } else if (dim === "daily") {
      o.rows = calc.gd.map((x) => [x.d, x.clicks, x.impr, x.ctr, x.pos]).reverse();
      o.cols = ["Date", "Clicks", "Impressions", "CTR", "Position"];
      o.sort = 0;
      o.bar = undefined;
    } else {
      o.rows = gscMerge(g, f.site, dim, 1);
      o.cols = [DIM_LABEL[dim], "Clicks", "Impressions", "CTR", "Position"];
      o.bar = undefined;
      o.sort = 1;
    }
    return o;
  }, [g, calc, dim, f.site]);

  if (e.error && !g) return <ErrorCard what="Search Console" />;
  if (!g || !calc || !table) {
    return (
      <>
        <div className={grid4}><SkKpi /><SkKpi /><SkKpi /><SkKpi /></div>
        <SkChart />
        <SkTable rows={6} />
      </>
    );
  }
  if (!calc.list.length) {
    return (
      <Card title="Search Console">
        <Empty msg="No readable Search Console property for this selection yet." />
        <p className="sub">Add gsc-readonly@streameros-dashboard.iam.gserviceaccount.com as a user on the property in Search Console, then wait for the next refresh.</p>
      </Card>
    );
  }

  const { a, b, gd } = calc;
  const toggles: { key: Metric; name: string; value: string; cur: number; prev: number; invert?: boolean }[] = [
    { key: "clicks", name: "Total clicks", value: n(a.clicks), cur: a.clicks, prev: b.clicks },
    { key: "impr", name: "Total impressions", value: n(a.impr), cur: a.impr, prev: b.impr },
    { key: "ctr", name: "Average CTR", value: a.ctr.toFixed(1) + "%", cur: a.ctr, prev: b.ctr },
    { key: "pos", name: "Average position", value: a.pos ? a.pos.toFixed(1) : "–", cur: a.pos, prev: b.pos, invert: true },
  ];
  const defs: { key: Metric; name: string; fmt: Series["fmt"] }[] = [
    { key: "clicks", name: "Clicks", fmt: "n" },
    { key: "impr", name: "Impressions", fmt: "n" },
    { key: "ctr", name: "CTR", fmt: "p" },
    { key: "pos", name: "Position", fmt: "pos" },
  ];
  const series: Series[] = defs
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => sm[d.key])
    .map(({ d, i }) => ({ name: d.name, color: GSC_COLOR[d.key], fmt: d.fmt, pts: gd.map((x) => [x.d, x[d.key]] as [string, number]) }));

  const dateLabel = (calc.gd.length ? `${calc.gd[0].d} to ${calc.gd[calc.gd.length - 1].d}` : "").replace(/-/g, "/");
  return (
    <>
      <p className="px-1 text-[13px] leading-relaxed text-mute">New to these numbers? Tap a word: <Term k="clicks">Clicks</Term> · <Term k="impressions">Impressions</Term> · <Term k="ctr">CTR</Term> · <Term k="position">Position</Term></p>
      <div className="hidden flex-wrap gap-2 text-[12.5px] sm:flex" aria-label="Report filters">
        <span className="rounded-full border border-line px-3 py-1 text-mute">Search type: <b className="text-ink">Web</b></span>
        <span className="rounded-full border border-line px-3 py-1 text-mute">Date: <b className="text-ink">{DEFAULT_RANGES.find((x) => x.id === f.range)?.label ?? f.range}</b>{dateLabel ? <span className="text-dim"> ({dateLabel})</span> : null}</span>
        <span className="rounded-full border border-line px-3 py-1 text-mute">Property: <b className="text-ink">{f.site === "all" ? "All sites" : label(f.site)}</b></span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-card animate-fadein">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {toggles.map((t) => {
            const on = sm[t.key];
            const c = GSC_COLOR[t.key];
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => setSm({ ...sm, [t.key]: !sm[t.key] })} className="text-left transition-colors" style={on ? { background: c, color: "#fff" } : undefined}>
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2 text-[12.5px]" style={on ? { color: "rgba(255,255,255,.9)" } : { color: "var(--mute)" }}>
                    <i className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border-2 text-[9px] leading-none" style={{ borderColor: on ? "#fff" : c, background: on ? "rgba(255,255,255,.25)" : "transparent" }}>{on ? "✓" : ""}</i>
                    {t.name}
                  </div>
                  <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight">{t.value}</div>
                  {f.cmp && t.prev ? <div className="mt-0.5 font-mono text-[11px]" style={{ opacity: on ? 0.85 : 0.6 }}>{t.cur >= t.prev ? "▲" : "▼"} {Math.abs(((t.cur - t.prev) / t.prev) * 100).toFixed(0)}% vs previous</div> : null}
                </div>
              </button>
            );
          })}
        </div>
        <AreaChart bare title="Performance" series={series} norm empty="Select a metric above to show it." />
      </div>
      <div className="flex gap-6 overflow-x-auto border-b border-line" role="tablist" aria-label="Report dimension">
        {DIMS.map(([id, nm]) => (
          <button key={id} type="button" role="tab" aria-selected={dim === id} onClick={() => setDim(id)} className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-[12.5px] font-semibold uppercase tracking-wide transition-colors ${dim === id ? "border-[#4285f4] text-[#8ab4f8]" : "border-transparent text-dim hover:text-ink"}`}>{nm}</button>
        ))}
      </div>
      <DataTable key={dim} title={TOP[dim] ?? ""} cols={table.cols} rows={table.rows} fmt={table.fmt} bar={table.bar} sort={table.sort} max={20} />
      {calc.missing.length > 0 && <p className="sub">Not connected: {calc.missing.map(label).join(", ")}. Add the service account as a user on those properties in Search Console.</p>}
      <p className="sub">Search Console data runs about 2 days behind. The published copy is rebuilt every 2 hours.</p>
    </>
  );
}

function BingSearch() {
  const f = useFilters();
  const e = useBing(f.range);
  const b = e.data;
  const [dim, setDim] = useState<"queries" | "pages">("queries");
  const calc = useMemo(() => {
    if (!b) return null;
    return { list: bingList(b, f.site), a: bingTotals(b, f.site, false), p: bingTotals(b, f.site, true), gd: bingDaily(b, f.site), rows: bingMerge(b, f.site, dim) };
  }, [b, f.site, dim]);

  if (e.error && !b) return <Card title="Bing"><Empty msg="Bing data is not published yet. It appears after the next refresh." /></Card>;
  if (!b || !calc) {
    return (
      <>
        <div className={grid4}><SkKpi /><SkKpi /><SkKpi /><SkKpi /></div>
        <SkChart />
        <SkTable rows={6} />
      </>
    );
  }
  if (!calc.list.length) {
    return (
      <Card title="Bing Webmaster Tools">
        <Empty msg={b.error ? `Bing data is not available: ${b.error}` : "No Bing data for this selection yet. New sites need a day or two after being added."} />
      </Card>
    );
  }
  const { a, p, gd } = calc;
  const series: Series[] = [
    { name: "Clicks", color: COLORS[0], fmt: "n", pts: gd.map((x) => [x.d, x.clicks] as [string, number]) },
    { name: "Impressions", color: COLORS[1], fmt: "n", pts: gd.map((x) => [x.d, x.impr] as [string, number]) },
  ];
  return (
    <>
      <div className={grid4}>
        <Kpi id="bing-clicks" title="Bing clicks" value={n(a.clicks)} delta={<Delta show={f.cmp} cur={a.clicks} prev={p.clicks} />} color={COLORS[0]} />
        <Kpi id="bing-impr" title="Bing impressions" value={n(a.impr)} delta={<Delta show={f.cmp} cur={a.impr} prev={p.impr} />} color={COLORS[1]} />
        <Kpi id="bing-ctr" title="Average CTR" value={a.ctr.toFixed(1) + "%"} delta={<Delta show={f.cmp} cur={a.ctr} prev={p.ctr} />} color={COLORS[2]} />
        <Kpi id="bing-pos" title="Average position" value={a.pos ? a.pos.toFixed(1) : "–"} color={COLORS[3]} />
      </div>
      <AreaChart title="Bing performance" series={series} norm empty="Bing has no daily numbers for this period." note="Bing reports with a delay, and some of its history is weekly, so it will not match Search Console exactly." />
      <div className="flex gap-1.5">
        {(["queries", "pages"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setDim(k)} className={`pill ${dim === k ? "on" : ""}`}>{k === "queries" ? "Queries" : "Pages"}</button>
        ))}
      </div>
      <DataTable key={dim} title={dim === "queries" ? "Bing queries" : "Bing pages"} cols={[dim === "queries" ? "Query" : "Page", "Clicks", "Impressions", "CTR", "Position"]} rows={calc.rows} fmt={[0, "n", "n", "p", "pos"]} bar={1} max={20} />
      <p className="sub">
        Copilot citations (the AI Performance report) are only in{" "}
        <a className="text-brand underline underline-offset-4" href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer">Bing Webmaster Tools</a>
        : Microsoft does not offer them through its API.
      </p>
    </>
  );
}

export default function Search() {
  const [src, setSrc] = useState<"google" | "bing">("google");
  return (
    <>
      <div className="flex gap-0.5 self-start rounded-xl bg-card p-[3px] shadow-inset" role="group" aria-label="Search engine">
        {(["google", "bing"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={src === k} onClick={() => setSrc(k)} className={`rounded-[9px] border px-4 py-1.5 ${src === k ? "border-brand/35 bg-brand/10 font-semibold text-brand" : "border-transparent text-mute hover:text-ink"}`}>
            {k === "google" ? "Google" : "Bing"}
          </button>
        ))}
      </div>
      {src === "google" ? <GoogleSearch /> : <BingSearch />}
    </>
  );
}
