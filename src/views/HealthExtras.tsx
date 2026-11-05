"use client";

import { useMemo } from "react";
import { SITES, SITE_COLOR, SITE_HOSTS } from "@/lib/config";
import { useCrawl, useHistory, useSpeed } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { Cell, Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Card, SkChart, SkTable } from "@/components/ui";
import { cols2 } from "./kit";

/** Pages in Google over time, one line per site (or the chosen site). Needs a few days of history to say much. */
export function IndexHistory() {
  const f = useFilters();
  const e = useHistory();
  const series = useMemo(() => {
    if (!e.data) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const out: Series[] = [];
    hosts.forEach((h) => {
      const pts = e.data!.filter((r) => r.sites[h]).map((r) => [r.d, r.sites[h][0]] as [string, number]);
      if (pts.length) out.push({ name: SITES[h], color: SITE_COLOR[SITES[h]], pts });
    });
    return out;
  }, [e.data, f.site]);
  if (e.error && !e.data) return null;
  if (!series) return <SkChart />;
  const days = e.data?.length ?? 0;
  return <AreaChart title="Pages in Google over time" series={series} note={days < 3 ? `One point is saved after each daily check, so this fills in over the next few days (${days} so far).` : "One point per daily check."} empty="No history yet. The first point is saved when the index check finishes." />;
}

const KIND: Record<string, string> = { broken: "Broken", redirect: "Redirects", noindex: "Noindex in sitemap", "no-title": "No title", "not-in-sitemap": "Not in sitemap" };

/** Daily check of every sitemap URL (does it load, redirect, say noindex, have a title) plus pages linked from the home page but missing from the sitemap. */
export function CrawlIssues() {
  const f = useFilters();
  const e = useCrawl();
  const calc = useMemo(() => {
    if (!e.data) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const counts: Record<string, number> = {};
    const found: { kind: string; row: Cell[] }[] = [];
    let checked = 0;
    hosts.forEach((h) => {
      const s = e.data!.sites[h];
      if (!s) return;
      checked += s.checked;
      s.issues.forEach((x) => {
        counts[x.kind] = (counts[x.kind] || 0) + 1;
        found.push({ kind: x.kind, row: [x.url.replace(/^https?:\/\//, ""), KIND[x.kind] || x.kind, x.detail] });
      });
    });
    const order = Object.keys(KIND);
    const rows = found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((x) => x.row);
    return { counts: Object.entries(counts).map(([k, v]) => [KIND[k] || k, v] as Cell[]), rows, checked, at: e.data.generatedAt };
  }, [e.data, f.site]);
  if (e.error && !e.data) return <Card title="Site check"><p className="sub">The first site check has not finished yet. It runs every night after the index check.</p></Card>;
  if (!calc) return <div className={cols2}><SkTable /><SkTable /></div>;
  return (
    <>
      <div className={cols2}>
        <DataTable title="Site check: what we found" cols={["Problem", "Pages"]} rows={calc.counts} fmt={[0, "n"]} bar={1} max={8} empty={`All ${calc.checked} pages loaded cleanly.`} note={`${calc.checked} pages checked ${new Date(calc.at).toLocaleDateString([], { day: "numeric", month: "short" })}.`} />
        <DataTable title="Pages to fix" cols={["Page", "Problem", "Detail"]} rows={calc.rows} fmt={[0, 0, 0]} max={12} empty="Nothing to fix." note="Broken pages first. A redirect in the sitemap should be replaced by its final address." />
      </div>
    </>
  );
}

const sec = (ms: number) => (ms / 1000).toFixed(1) + " s";
/** Lab speed test (Lighthouse, mobile) from the daily GitHub job: score, LCP, CLS and blocking time for each site's home page. */
export function SpeedCard() {
  const e = useSpeed();
  if (e.error && !e.data) return null;
  if (!e.data) return <SkTable />;
  const last = e.data.runs[e.data.runs.length - 1];
  if (!last) return null;
  const rows: Cell[][] = SITE_HOSTS.filter((h) => last.sites[h]).map((h) => {
    const s = last.sites[h]!;
    return [SITES[h], s.score, sec(s.lcp), s.cls.toFixed(2), `${Math.round(s.tbt)} ms`];
  });
  return (
    <DataTable title="Speed (lab test, mobile)" cols={["Site", "Score", "LCP", "CLS", "Blocking"]} rows={rows} fmt={[0, "n", 0, 0, 0]} max={10} sort={1}
      note={`Home pages, tested ${new Date(last.at).toLocaleDateString([], { day: "numeric", month: "short" })} with Lighthouse. A lab test on a shared machine, so it moves a few points between runs. Aim for 90+, LCP under 2.5 s.`} />
  );
}
