"use client";

import { useMemo, useState } from "react";
import { COLORS } from "@/lib/config";
import { useGSC } from "@/lib/data";
import { gscDaily, gscList, gscMerge, gscMissing, gscTotals, label, n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import type { Cell, Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Card, Delta, Empty, ErrorCard, SkChart, SkKpi, SkTable } from "@/components/ui";
import { grid4 } from "./kit";

type Metric = "clicks" | "impr" | "ctr" | "pos";
const DIMS: [string, string][] = [["queries", "Queries"], ["pages", "Pages"], ["countries", "Countries"], ["devices", "Devices"], ["daily", "Dates"], ["queryPage", "Query on page"]];
const DIM_LABEL: Record<string, string> = { queries: "Query", pages: "Page", countries: "Country", devices: "Device" };

export default function Search() {
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
      o.bar = 2;
    } else if (dim === "daily") {
      o.rows = calc.gd.map((x) => [x.d, x.clicks, x.impr, x.ctr, x.pos]).reverse();
      o.cols = ["Date", "Clicks", "Impressions", "CTR", "Position"];
      o.sort = 0;
      o.bar = undefined;
    } else {
      o.rows = gscMerge(g, f.site, dim, 1);
      o.cols = [DIM_LABEL[dim], "Clicks", "Impressions", "CTR", "Position"];
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
    .map(({ d, i }) => ({ name: d.name, color: COLORS[i], fmt: d.fmt, pts: gd.map((x) => [x.d, x[d.key]] as [string, number]) }));

  return (
    <>
      <div className={grid4}>
        {toggles.map((t, i) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={sm[t.key]}
            onClick={() => setSm({ ...sm, [t.key]: !sm[t.key] })}
            className={`card text-left transition-colors ${sm[t.key] ? "border-line2" : "opacity-60"}`}
            style={sm[t.key] ? { borderColor: COLORS[i] } : undefined}
          >
            <div className="flex items-center gap-2 text-[12.5px] text-mute">
              <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: sm[t.key] ? COLORS[i] : "transparent", border: `2px solid ${COLORS[i]}` }} />
              {t.name}
            </div>
            <div className="mt-1 text-[28px] font-bold leading-tight tracking-tight">{t.value}</div>
            <Delta show={f.cmp} cur={t.cur} prev={t.prev} invert={t.invert} />
          </button>
        ))}
      </div>
      <AreaChart title="Performance" series={series} norm empty="Tap a metric above to show it." note="Tap a metric to show or hide it. Each line uses its own scale. Touch the chart for exact values." />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DIMS.map(([id, nm]) => (
          <button key={id} type="button" onClick={() => setDim(id)} className={`pill ${dim === id ? "on" : ""}`}>{nm}</button>
        ))}
      </div>
      <DataTable key={dim} title={DIMS.find((d) => d[0] === dim)?.[1] ?? ""} cols={table.cols} rows={table.rows} fmt={table.fmt} bar={table.bar} sort={table.sort} max={20} />
      {calc.missing.length > 0 && <p className="sub">Not connected: {calc.missing.map(label).join(", ")}. Add the service account as a user on those properties in Search Console.</p>}
      <p className="sub">Search Console data runs about 2 days behind. The published copy is rebuilt every 2 hours.</p>
    </>
  );
}
