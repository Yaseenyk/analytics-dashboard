"use client";

import { useMemo, useState } from "react";
import { SITES, SITE_COLOR, SITE_HOSTS } from "@/lib/config";
import { useCrawl, useHealth, useHistory, useSpeed } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { Cell, Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Card, SkChart, SkTable } from "@/components/ui";
import { cols2 } from "./kit";

const SOURCE_WEBSITE = /404|not found|noindex|robots|redirect|soft 404|server error|blocked|unauthorized|forbidden/i;
const NOT_COLOR = "#9aa0a6";
const IN_COLOR = "#0f9d58";
const lastCrawl = (d: string | null) => (d ? d.replace(/-/g, "/") : "Never");

/** Page indexing, laid out like Search Console: Not indexed / Indexed tiles over a chart, then "Why pages aren't indexed" with the
    pages behind each reason one click away. Reads the nightly index check and its daily history. */
export function PageIndexing() {
  const f = useFilters();
  const h = useHealth().data;
  const hist = useHistory().data;
  const [pick, setPick] = useState<string>("");
  const calc = useMemo(() => {
    if (!h) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const reasons = new Map<string, { urls: [string, string | null][] }>();
    const indexed: [string, string | null][] = [];
    hosts.forEach((host) => {
      const s = h.index?.[host];
      if (!s) return;
      s.urls.forEach((u) => {
        const r = reasons.get(u[1]) || { urls: [] };
        r.urls.push([u[0], u[2]]);
        reasons.set(u[1], r);
      });
      (s.indexedUrls ?? []).forEach((u) => indexed.push([u, null]));
    });
    const notIn = [...reasons.entries()].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.urls.length - a.urls.length);
    const series: Series[] = [];
    if (hist && hist.length) {
      const pick2 = (fn: (x: [number, number]) => number) => hist.map((r) => [r.d, hosts.reduce((a, host) => a + (r.sites[host] ? fn(r.sites[host]) : 0), 0)] as [string, number]);
      series.push({ name: "Not indexed", color: NOT_COLOR, fmt: "n", pts: pick2((x) => x[1] - x[0]) }, { name: "Indexed", color: IN_COLOR, fmt: "n", pts: pick2((x) => x[0]) });
    }
    return { notIn, indexed, notCount: notIn.reduce((a, r) => a + r.urls.length, 0), series, at: h.indexAt };
  }, [h, hist, f.site]);
  if (!calc) return <SkTable />;
  const sel = pick || (calc.notIn[0]?.reason ?? "__indexed");
  const rows = sel === "__indexed" ? calc.indexed : calc.notIn.find((r) => r.reason === sel)?.urls ?? [];
  const tile = (key: string, name: string, n: number, color: string) => (
    <div className="px-4 py-3.5" style={{ borderTop: `3px solid ${color}` }}>
      <div className="text-[12.5px] text-mute">{name}</div>
      <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight">{n.toLocaleString("en-US")}</div>
    </div>
  );
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-line bg-card animate-fadein">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="h2">Page indexing</h2>
          <span className="font-mono text-[11.5px] text-dim">Last checked {calc.at ? new Date(calc.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 border-y border-line">
          {tile("not", "Not indexed", calc.notCount, NOT_COLOR)}
          {tile("in", "Indexed", calc.indexed.length, IN_COLOR)}
        </div>
        {calc.series.length ? <AreaChart bare title="Page indexing over time" series={calc.series} empty="No history yet." /> : <p className="sub px-4 pb-4">The trend line appears after the nightly index check has run for a few days.</p>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-card animate-fadein">
        <div className="px-4 pt-4"><h2 className="h2">Why pages aren&apos;t indexed</h2><p className="sub">Select a reason to see the pages behind it.</p></div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line text-left text-[11.5px] text-dim">
                <th scope="col" className="px-4 py-2 font-medium">Reason</th>
                <th scope="col" className="px-3 py-2 font-medium">Source</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Pages</th>
              </tr>
            </thead>
            <tbody>
              {calc.notIn.map((r) => (
                <tr key={r.reason} onClick={() => setPick(r.reason)} className={`cursor-pointer border-b border-line transition-colors hover:bg-white/[.04] ${sel === r.reason ? "bg-[#4285f4]/10" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.reason}</td>
                  <td className="px-3 py-2.5 text-mute">{SOURCE_WEBSITE.test(r.reason) ? "Website" : "Google systems"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.urls.length}</td>
                </tr>
              ))}
              <tr onClick={() => setPick("__indexed")} className={`cursor-pointer transition-colors hover:bg-white/[.04] ${sel === "__indexed" ? "bg-[#4285f4]/10" : ""}`}>
                <td className="px-4 py-2.5 font-medium" style={{ color: IN_COLOR }}>Indexed</td>
                <td className="px-3 py-2.5 text-mute">Google</td>
                <td className="px-4 py-2.5 text-right font-mono">{calc.indexed.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[13.5px] font-semibold">{sel === "__indexed" ? "Indexed pages" : sel}</h3>
            <span className="font-mono text-[11.5px] text-dim">{rows.length} page{rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-2 max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead><tr className="text-left text-[11.5px] text-dim"><th className="py-1.5 pr-3 font-medium">URL</th><th className="w-px whitespace-nowrap py-1.5 pl-3 text-right font-medium">Last crawled</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map(([url, crawled]) => (
                  <tr key={url} className="border-t border-line">
                    <td className="max-w-0 py-2 pr-3"><a href={url} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12px] hover:text-brand" title={url}>{url.replace(/^https?:\/\//, "")}</a></td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-mono text-[11.5px] text-mute">{sel === "__indexed" ? "–" : lastCrawl(crawled)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={2} className="py-4 text-center text-dim">No pages here.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="sub">Showing the first 300.</p>}
        </div>
      </div>
    </>
  );
}

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
  if (e.error && !e.data) return <Card title="Pages in Google over time"><p className="sub">No history yet. One point is saved after each nightly index check (02:40 UTC), so the line appears over the next few days.</p></Card>;
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
