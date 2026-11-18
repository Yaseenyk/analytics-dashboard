"use client";

import { useMemo } from "react";
import { SITE_HOSTS, gscProperty } from "@/lib/config";
import { gscMerge } from "@/lib/derive";
import { useGSC } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { Cell } from "@/lib/types";
import type { Insights } from "@/lib/pulse";
import { Card } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { KIND_LABEL, Rows, ago, pct, site } from "./watchkit";

const DOT = { good: "bg-good", warn: "bg-yellow-400", bad: "bg-bad" } as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const label = (kind: string, host: string) => (host ? `${host} (${KIND_LABEL[kind] ?? kind})` : KIND_LABEL[kind] ?? kind);
/** Under this many visits a percentage can be one person, so the row is marked FEW. */
export const FEW = 10;
const FEW_NOTE = ` Rows marked FEW have under ${FEW} visits: one person can swing the numbers, so do not read much into them.`;
const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

/** What happened lately that you would want to know about: wins, new sources, broken pages, bot spikes. */
export function AlertsCard({ ins }: { ins: Insights | null }) {
  const list = ins?.alerts ?? [];
  return (
    <Card title="What is new" note="The last 2 days: a download or contact, a new source, a broken page, a script error.">
      {!ins ? null : list.length === 0 ? (
        <p className="sub mt-3">Nothing new in the last 2 days.</p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-2 p-0">
          {list.map((a) => (
            <li key={a.id} className="flex gap-2.5 rounded-xl bg-white/[.03] px-3 py-2.5">
              <i aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.level]}`} />
              <div className="min-w-0 text-[13.5px]">
                <div className="break-words">{a.title}</div>
                <div className="mt-0.5 break-all text-[12px] text-dim">{a.site ? `${site(a.site)} · ` : ""}{a.detail ? `${a.detail} · ` : ""}{ago(a.ts)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SourceQuality({ ins }: { ins: Insights }) {
  return (
    <DataTable
      title="Which sources bring people who act"
      note={"Real people only. Acted = the visit included at least one tap on a link, button, tab, form field or download." + FEW_NOTE}
      weak={(r) => +r[1]! < FEW}
      cols={["Source", "Visits", "Acted", "Acted %", "Time on site"]}
      fmt={[0, "n", "n", "p", "dur"]}
      bar={1}
      max={10}
      rows={ins.sources.map((s) => [label(s.ref_kind, s.ref_host), s.visits, s.wins ?? 0, s.visits ? (100 * (s.wins ?? 0)) / s.visits : 0, s.active ?? 0])}
    />
  );
}

/** Google Search Console and real behaviour side by side, one line per landing page. */
export function Landing({ ins }: { ins: Insights }) {
  const f = useFilters();
  const g = useGSC(f.range);
  const rows = useMemo(() => {
    if (!g.data) return null;
    const key = (host: string, path: string) => `${host}${path}`;
    const mine = new Map<string, { visits: number; wins: number }>();
    ins.pages.forEach((p) => mine.set(key(p.site, p.path), { visits: p.visits, wins: p.wins ?? 0 }));
    const out: Cell[][] = [];
    const seen = new Set<string>();
    gscMerge(g.data, f.site, "pages", 1).forEach((r) => {
      let k = "";
      try { const u = new URL(String(r[0])); k = key(u.host, u.pathname); } catch { return; }
      const m = mine.get(k);
      seen.add(k);
      out.push([`${site(k.split("/")[0]!)} /${k.split("/").slice(1).join("/")}`, +r[2]! || 0, +r[1]! || 0, m?.visits ?? 0, m?.wins ?? 0]);
    });
    return out;
  }, [g.data, ins, f.site]);
  if (!rows) return null;
  return (
    <DataTable
      title="From Google to a real visit"
      note="For each page: how often Google showed it, how many clicked, and how many real visitors then tapped something."
      cols={["Page", "Shown in Google", "Google clicks", "Real visits", "Acted"]}
      fmt={[0, "n", "n", "n", "n"]}
      bar={1}
      max={10}
      empty="Search Console has no page data for this choice yet."
      rows={rows}
    />
  );
}

const addDays = (day: string, k: number) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });

/** How much the tracker misses: Search Console's clicks next to the tracker's arrivals from Google, over the days both counted in full. */
export function CrossCheck({ ins }: { ins: Insights }) {
  const f = useFilters();
  const g = useGSC(f.range).data;
  const c = useMemo(() => {
    if (!g || !ins.google) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const daily = (h: string) => (g.search?.[gscProperty(h)]?.daily ?? []) as Cell[][];
    let last = "";
    hosts.forEach((h) => daily(h).forEach((r) => { if (String(r[0]) > last) last = String(r[0]); }));
    // the oldest day in the tracker's window is cut off part way, like the day each site was switched on
    const cut = new Date(Date.parse(ins.generatedAt) - ins.days * 864e5 - 8 * 36e5).toISOString().slice(0, 10);
    const start = new Map(ins.google.starts.map((s) => [s.site, s.day]));
    const rows: Cell[][] = [];
    let from = "";
    let firstFull = "";
    hosts.forEach((h) => {
      const st0 = start.get(h);
      if (!st0) return;
      const st = st0 > cut ? st0 : cut;
      if (!firstFull || addDays(st, 1) < firstFull) firstFull = addDays(st, 1);
      if (!last || st >= last) return;
      const inWin = (d: string) => d > st && d <= last;
      const clicks = daily(h).filter((r) => inWin(String(r[0]))).reduce((a, r) => a + (+r[1]! || 0), 0);
      const mine = ins.google!.rows.filter((r) => r.site === h && inWin(r.day));
      const real = mine.reduce((a, r) => a + r.real, 0);
      const idle = mine.reduce((a, r) => a + r.idle, 0);
      if (!clicks && !real && !idle) return;
      rows.push([site(h), clicks, real, idle, clicks ? (100 * (real + idle)) / clicks : 0]);
      if (!from || addDays(st, 1) < from) from = addDays(st, 1);
    });
    return { rows, last, from, firstFull };
  }, [g, ins, f.site]);
  if (!c) return null;
  if (!c.rows.length) {
    return (
      <Card title="Cross-check with Google" note="Search Console’s clicks next to the visits our tracker saw arrive from Google.">
        <p className="sub mt-3">
          No full day in common yet. Search Console runs two to three days behind{c.last ? ` (its newest day is ${shortDay(c.last)})` : ""}
          {c.firstFull ? `, and the tracker’s first full day was ${shortDay(c.firstFull)}` : ""}. The table fills in by itself once Search Console reaches that day.
        </p>
      </Card>
    );
  }
  return (
    <DataTable
      title="Cross-check with Google"
      note={`${shortDay(c.from)} to ${shortDay(c.last)}, the days both have counted in full (Search Console’s days, Pacific time). Tracker saw = tracker arrivals from Google as a share of Search Console’s clicks. Well under 100% means visits are being missed: ad blockers, or people leaving before the script loads. Search Console also hides a few clicks, so a small gap either way is normal.`}
      cols={["Site", "Google clicks", "Tracker: real", "Tracker: did nothing", "Tracker saw"]}
      fmt={[0, "n", "n", "n", "p"]}
      bar={1}
      max={12}
      weak={(r) => +r[1]! < FEW}
      rows={c.rows}
    />
  );
}

export function PagesDeep({ ins, all }: { ins: Insights; all: boolean }) {
  return (
    <DataTable
      title="Pages: where people enter, leave and act"
      note={"Views = times the page was opened. Entered here = the first page of a visit. Left here = the last page. Load = seconds until the main content showed (under 2.5 is good)." + FEW_NOTE}
      weak={(r) => +r[1]! < FEW}
      cols={["Page", "Views", "Entered here", "Left here", "Acted", "Read", "Time", "Load (s)"]}
      fmt={[0, "n", "n", "n", "n", "p", "dur", "pos"]}
      bar={1}
      max={10}
      rows={ins.pages.map((p) => [`${all ? site(p.site) + " " : ""}${p.path}`, p.visits, p.entries ?? 0, p.exits ?? 0, p.wins ?? 0, p.scroll ?? 0, p.active ?? 0, p.lcp ? p.lcp / 1000 : 0])}
    />
  );
}

export function Flow({ ins, all }: { ins: Insights; all: boolean }) {
  const f = ins.funnel;
  const rows = [
    { name: "Opened a page", v: f.sessions, note: "100%" },
    { name: "Opened a second page", v: f.multi ?? 0, note: `${pct(f.multi ?? 0, f.sessions)}%` },
    { name: "Tapped something", v: f.won ?? 0, note: `${pct(f.won ?? 0, f.sessions)}%` },
  ];
  return (
    <>
      <Card title="How far people go" note="Real people only. Each step is a share of everyone who opened a page.">
        {f.sessions ? <Rows rows={rows} /> : <p className="sub mt-3">No real visits yet.</p>}
        {f.sessions > 0 && f.sessions < 30 && <p className="sub">Only {f.sessions} {f.sessions === 1 ? "person" : "people"} so far, so treat these percentages as rough.</p>}
      </Card>
      <DataTable
        title="Where people go next"
        note="After this page, which page did they open?"
        cols={["From → To", "People"]}
        fmt={[0, "n"]}
        bar={1}
        max={10}
        empty="Nobody has opened a second page yet."
        rows={ins.flows.map((x) => [`${all ? site(x.site) + " " : ""}${x.from_path} → ${x.to_path}`, x.n])}
      />
    </>
  );
}

/** Real visits by hour of day and by weekday. The tracker already counts both in Indian time. */
export function When({ ins }: { ins: Insights }) {
  const { hours, days } = useMemo(() => {
    const h = new Array<number>(24).fill(0);
    const d = new Array<number>(7).fill(0);
    ins.hours.forEach((r) => {
      h[r.hour]! += r.n;
      d[r.dow]! += r.n;
    });
    return { hours: h, days: d };
  }, [ins.hours]);
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const hm = Math.max(...hours, 1);
  return (
    <Card title="When real people visit" note="Visits by hour and by weekday, in Indian time.">
      <div className="mt-3 flex h-24 items-end gap-[3px]" role="img" aria-label="Real visits by hour of the day">
        {hours.map((v, i) => (
          <div key={i} title={`${hourName(i)}: ${v} visits`} className="flex h-full flex-1 flex-col justify-end">
            <i className="block w-full rounded-t bg-brand" style={{ height: `${Math.max(v ? 6 : 0, (100 * v) / hm)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-dim"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
      <Rows rows={days.map((v, i) => ({ name: DAYS[i]!, v }))} />
    </Card>
  );
}

export function Broken({ ins, all }: { ins: Insights; all: boolean }) {
  return (
    <>
      <DataTable
        title="Broken pages people reached"
        note="A real or unclear visitor landed on a page that does not exist. Fix the link that sent them."
        cols={["Page", "Came from", "Times", "Last"]}
        fmt={[0, 0, "n", 0]}
        bar={2}
        sort={2}
        max={5}
        empty="No broken pages reached. Counting started on 17 Nov 2026."
        rows={ins.broken.map((b) => [`${all ? site(b.site) + " " : ""}${b.path}`, b.ref_host || "typed or bookmarked", b.n, ago(b.last)])}
      />
      <DataTable
        title="Script errors"
        note="Pages where something in the page’s code failed for a visitor. Messages are never stored."
        cols={["Page", "Errors", "Visits", "Last"]}
        fmt={[0, "n", "n", 0]}
        bar={1}
        max={5}
        empty="No script errors recorded."
        rows={ins.errors.map((e) => [`${all ? site(e.site) + " " : ""}${e.path}`, e.errors, e.visits, ago(e.last)])}
      />
      <DataTable
        title="Slowest pages"
        note="Average seconds until the main content showed, from real visits. Under 2.5 is good."
        cols={["Page", "Seconds", "Visits"]}
        fmt={[0, "pos", "n"]}
        bar={1}
        max={5}
        empty="No speed data yet."
        rows={ins.speed.map((x) => [`${all ? site(x.site) + " " : ""}${x.path}`, x.lcp / 1000, x.n])}
      />
    </>
  );
}
