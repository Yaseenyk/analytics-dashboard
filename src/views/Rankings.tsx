"use client";

import { useMemo } from "react";
import { COLORS } from "@/lib/config";
import { useRanks } from "@/lib/data";
import { quickWins, rankRows } from "@/lib/derive";
import type { Cell, Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { ErrorCard, SkChart, SkTable } from "@/components/ui";
import { useGscMemo } from "./kit";
import { OptimizerCard } from "./Optimizer";

function Tracked() {
  const e = useRanks();
  const calc = useMemo(() => {
    if (!e.data) return null;
    const rows = rankRows(e.data);
    const table: Cell[][] = rows.map((r) => {
      const move = r.pos !== null && r.prevPos !== null ? r.prevPos - r.pos : null; // positive = moved up
      return [r.kw, r.pos === null ? "not shown" : r.pos.toFixed(1), move === null ? "new" : Math.abs(move) < 0.05 ? "same" : `${move > 0 ? "▲" : "▼"} ${Math.abs(move).toFixed(1)}`, r.impr, r.clicks];
    });
    const series: Series[] = rows
      .filter((r) => r.days.length > 1)
      .slice(0, 5)
      .map((r, i) => ({ name: r.kw, color: COLORS[i % COLORS.length], fmt: "pos" as const, pts: r.days.map((d) => [d[0], d[1]] as [string, number]) }));
    return { table, series };
  }, [e.data]);
  if (e.error && !e.data) return <ErrorCard what="tracked phrases" />;
  if (!calc) return <><SkChart /><SkTable /></>;
  return (
    <>
      <AreaChart title="Google position over time (lower is better)" series={calc.series} empty="No tracked phrase has shown up in Google yet." note="The five tracked phrases with the most impressions. Position 1 is the top result; 10 is the bottom of page one." />
      <DataTable title="Tracked phrases, last 7 days" cols={["Phrase", "Position", "Vs week before", "Impressions", "Clicks"]} rows={calc.table} fmt={[0, 0, 0, "n", "n"]} max={12}
        note="These are the phrases we watch. ▲ means the page moved up in Google since last week, ▼ means it slipped. Position 1 is the top; 10 is the bottom of page one; above 10 is page two or later." empty="Waiting for the first nightly run." />
    </>
  );
}

function QuickWins() {
  const { v, error } = useGscMemo((g, site) => quickWins(g, site));
  if (error) return <ErrorCard what="quick wins" />;
  if (!v) return <SkTable />;
  const rows: Cell[][] = v.map((x) => [x.query, x.page.replace(/^https?:\/\//, ""), x.pos, x.impr, x.clicks, x.extra]);
  return (
    <DataTable title="Quick wins: searches just off the top" cols={["Search", "Page", "Position", "Impressions", "Clicks", "Could gain"]} rows={rows} fmt={[0, 0, "pos", "n", "n", "n"]} max={15} sort={5}
      note="Google already shows these pages for these searches, but at positions 4 to 20. Improve the page (better title, answer the question higher up, link to it from other pages) and they can climb. 'Could gain' is the extra clicks over this period if the page reached position 3, an estimate. Uses the date range and site chosen above."
      empty="No quick wins yet: needs searches with at least 10 impressions between positions 4 and 20." />
  );
}

export default function Rankings() {
  return (
    <>
      <Tracked />
      <QuickWins />
      <OptimizerCard />
    </>
  );
}
