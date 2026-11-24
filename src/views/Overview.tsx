"use client";

import { useState } from "react";
import { BRAND, CAT_COLOR, COLORS, SITES, STREAMS, gscProperty } from "@/lib/config";
import { useGA, useGSC, useLive } from "@/lib/data";
import {
  classify, daily, dailyAll, dailyTotal, dur, gscDaily, gscMerge, gscMissing, gscTotals, group, hasGA, ix, label, n, pct, rep, sourcesAgg, sum,
} from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { Banner, Card, Delta, Icon, Sk, SkCard, SkText, Wait } from "@/components/ui";
import { HelpDot } from "@/components/Term";
import QuickBoxes from "./QuickBoxes";
import HomeKpis from "./HomeKpis";
import NotIndexedLink from "./NotIndexed";
import InsightLinks from "./Insights";
import { GaArea, GaDonut, GaKpi, GaRank, GscKpi, GscRank, cols2, grid4, useGaMemo, useGscMemo } from "./kit";

function GaBanner() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const stale = ga?.staleSince;
  const { v } = useGaMemo((ga) => !hasGA(ga));
  if (ga?.idle) return <Banner><b>No Google Analytics numbers are saved yet.</b> Tap Refresh under Google Analytics to load them. They are then kept, so opening the dashboard costs nothing.</Banner>;
  if (ga?.down) return <Banner><b>Google Analytics is not answering right now.</b> Visitor numbers will appear by themselves once it does. Search Console, Bing and Live still show.</Banner>;
  if (stale) return <Banner><b>Google Analytics is not answering right now.</b> These visitor numbers are from {new Date(stale).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. They update by themselves when Google answers again.</Banner>;
  return v ? <Banner><b>Google is still processing the new tags.</b> Visitor numbers appear about a day after a tag goes live. Live visitors and Search Console show meanwhile.</Banner> : null;
}

function LiveCard() {
  const f = useFilters();
  const e = useLive();
  if (!e.data) return <SkCard><Sk w={30} h={18} /></SkCard>;
  const rows = e.data.streams.rows.filter((r) => f.site === "all" || STREAMS[String(r[0])] === SITES[f.site]);
  const total = rows.reduce((s, r) => s + +r[1], 0);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="h-[7px] w-[7px] animate-pulseglow rounded-full bg-good" />
        <span className="text-[26px] font-bold leading-none">{n(total)}</span>
        <span className="text-[12.5px] text-dim">online now (last 30 min)</span><HelpDot k="online" />
        {rows.map((r) => (
          <span key={String(r[0])} className="rounded-full border border-line bg-card2 px-2.5 py-1 text-[12.5px]">
            {STREAMS[String(r[0])] || String(r[0])} <b>{String(r[1])}</b>
          </span>
        ))}
      </div>
    </Card>
  );
}

const total = (ga: Parameters<typeof rep>[0], met: string, site: string, prev = false) => sum(rep(ga, prev ? "totalsPrev" : "totals"), met, site);

function Summary() {
  const { v } = useGaMemo((ga, site) => {
    if (!hasGA(ga)) return { none: true as const };
    const t = rep(ga, "totals");
    const ses = sum(t, "sessions", site), usr = sum(t, "activeUsers", site), nu = sum(t, "newUsers", site), key = sum(t, "keyEvents", site);
    const src = sourcesAgg(ga, site);
    const tot = src.reduce((s, x) => s + x.sessions, 0);
    const ai = src.filter((x) => x.cat === "AI assistants");
    const aiN = ai.reduce((s, x) => s + x.sessions, 0);
    const ev: Record<string, number> = {};
    group(rep(ga, "events"), [1], site).forEach((g) => (ev[g.k[0]] = g.m[0]));
    return { none: false as const, ses, usr, nu, key, src, tot, ai, aiN, ev, days: ga.days };
  });
  if (!v) return <SkText />;
  if (v.none) return null;
  const top = v.src[0];
  const chips: [string, string, string][] = [
    ["New visitors", `${Math.min(100, pct(v.nu, v.usr)).toFixed(0)}%`, `of ${n(v.usr)} people`],
    ["Top source", top ? `${pct(top.sessions, v.tot).toFixed(0)}%` : "–", top ? (top.name === "(not set)" ? "Unassigned" : top.name) : "none yet"],
    ["From AI assistants", n(v.aiN), v.ai.length ? v.ai.slice(0, 2).map((x) => `${x.name} ${n(x.sessions)}`).join(", ") : "none yet"],
    ["Sign-ups and forms", n(v.ev.generate_lead || 0), `${n(v.ev.whatsapp_click || 0)} WhatsApp taps`],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {chips.map(([title, big, small]) => (
        <div key={title} className="card !p-3.5">
          <div className="truncate text-[12.5px] text-mute">{title}</div>
          <div className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight">{big}</div>
          <div className="mt-1.5 truncate text-[11.5px] text-dim">{small}</div>
        </div>
      ))}
    </div>
  );
}

function VisitsChart() {
  const [split, setSplit] = useState(false);
  const f = useFilters();
  const all = f.site === "all";
  return (
    <GaArea
      title="Visits per day"
      extra={all ? (
        <div className="flex gap-0.5 rounded-xl bg-card2 p-[3px]">
          {[["Total", false], ["By site", true]].map(([lb, val]) => (
            <button key={String(lb)} type="button" onClick={() => setSplit(val as boolean)} aria-pressed={split === val} className={`rounded-[9px] px-3 py-1 text-[12.5px] ${split === val ? "bg-brand/10 font-semibold text-brand" : "text-mute"}`}>{String(lb)}</button>
          ))}
        </div>
      ) : undefined}
      build={(ga, site) => {
        const d = rep(ga, "daily");
        return split && site === "all" ? daily(d, "sessions", site) : [{ name: site === "all" ? "All sites" : label(site), color: BRAND, pts: dailyAll(d, "sessions", site) }];
      }}
    />
  );
}

/** Every site in one compact table: people (with a bar to compare), Google clicks and average position. A row filters to that site. */
function Sites() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const gs = useGSC(f.range).data;
  if (f.site !== "all") return null;
  const t = rep(ga, "totals");
  const hi = t.dims.length ? ix(t, "hostName") : -1;
  const people = (host: string) => t.rows.filter((r) => r[hi] === host).reduce((a, r) => a + (+r[t.dims.length + t.mets.indexOf("activeUsers")] || 0), 0);
  const rows = Object.keys(SITES).map((h) => {
    const g = gs?.search?.[gscProperty(h)];
    const ok = !!(g && g.ok && g.total);
    return { h, people: ga && hasGA(ga) ? people(h) : null, clicks: ok ? +g!.total![0] : null, pos: ok && +g!.total![3] ? +g!.total![3] : null };
  }).sort((a, b) => (b.people ?? -1) - (a.people ?? -1));
  const max = Math.max(1, ...rows.map((r) => r.people ?? 0));
  return (
    <Card title="Your sites" extra={<span className="text-[12px] text-dim">Tap a site to filter</span>}>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_52px_44px_40px] gap-x-2 border-b border-white/[.06] pb-1.5 text-[11.5px] text-dim">
        <span>Site · people</span><span className="text-right">People</span><span className="text-right">Clicks</span><span className="text-right">Pos.</span>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((r) => (
          <li key={r.h}>
            <button type="button" onClick={() => f.setSite(r.h)} className="grid w-full grid-cols-[minmax(0,1fr)_52px_44px_40px] items-center gap-x-2 border-b border-white/[.04] py-2 text-left last:border-0 active:bg-white/[.04]">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{SITES[r.h]}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true"><i className="block h-full rounded-full bg-brand" style={{ width: `${r.people ? Math.max(3, (100 * r.people) / max) : 0}%` }} /></span>
              </span>
              <span className="text-right font-mono text-[13px] tabular-nums">{r.people === null ? "–" : n(r.people)}</span>
              <span className="text-right font-mono text-[13px] tabular-nums text-mute">{r.clicks === null ? "–" : n(r.clicks)}</span>
              <span className="text-right font-mono text-[13px] tabular-nums text-mute">{r.pos === null ? "–" : r.pos.toFixed(0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const HELP: Record<string, string> = { ev: "engaged", gi: "impressions", gc: "ctr", gp: "position" };

function MoreNumbers() {
  const mk = (title: string, id: string, calc: (ga: Parameters<typeof rep>[0], site: string, cmp: boolean) => { value: string; delta?: React.ReactNode }) => (
    <GaKpi key={id} title={title} id={id} help={HELP[id]} calc={(ga, site, cmp) => (hasGA(ga) ? calc(ga, site, cmp) : { value: "–" })} />
  );
  const gk = (title: string, id: string, field: "impr" | "ctr" | "pos") => (
    <GscKpi
      key={id}
      title={title}
      id={id}
      help={HELP[id]}
      calc={(g, site, cmp) => {
        const a = gscTotals(g, site, false), b = gscTotals(g, site, true);
        const value = field === "impr" ? n(a.impr) : field === "ctr" ? a.ctr.toFixed(1) + "%" : a.pos ? a.pos.toFixed(1) : "–";
        return { value, delta: <Delta show={cmp} cur={a[field]} prev={b[field]} invert={field === "pos"} /> };
      }}
    />
  );
  return (
    <details className="group rounded-2xl border border-line bg-card/50 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-[13.5px] font-semibold text-mute group-open:text-ink">
        More numbers
        <Icon name="chevron" className="h-4 w-4 flex-none text-dim transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <div className={`${grid4} p-3 pt-0`}>
        {mk("New people", "np", (ga, s, c) => ({ value: n(total(ga, "newUsers", s)), delta: <Delta show={c} cur={total(ga, "newUsers", s)} prev={total(ga, "newUsers", s, true)} /> }))}
        {mk("Page views", "pv", (ga, s, c) => ({ value: n(total(ga, "screenPageViews", s)), delta: <Delta show={c} cur={total(ga, "screenPageViews", s)} prev={total(ga, "screenPageViews", s, true)} /> }))}
        {mk("Visits per person", "vpp", (ga, s) => ({ value: total(ga, "activeUsers", s) ? (total(ga, "sessions", s) / total(ga, "activeUsers", s)).toFixed(2) : "–" }))}
        {mk("Engaged visits", "ev", (ga, s) => ({ value: pct(total(ga, "engagedSessions", s), total(ga, "sessions", s)).toFixed(1) + "%" }))}
        {mk("Time per person", "tpp", (ga, s) => ({ value: dur(total(ga, "userEngagementDuration", s) / (total(ga, "activeUsers", s) || 1)) }))}
        {gk("Search impressions", "gi", "impr")}
        {gk("Search CTR", "gc", "ctr")}
        {gk("Avg position", "gp", "pos")}
      </div>
    </details>
  );
}

function GscMissingNote() {
  const { v } = useGscMemo((g, site) => gscMissing(g, site));
  if (!v || !v.length) return null;
  return <p className="sub">Search Console not connected for: {v.map(label).join(", ")}.</p>;
}

export default function Overview() {
  return (
    <>
      <QuickBoxes />
      <GaBanner />
      <HomeKpis />
      <div className="card !p-0 divide-y divide-white/[.06] overflow-hidden">
        <NotIndexedLink />
        <InsightLinks />
      </div>
      <Summary />
      <VisitsChart />
      <div className={cols2}>
        <GaDonut title="Where visitors come from" colorOf={(nm, i) => CAT_COLOR[nm] || COLORS[i % COLORS.length]} build={(ga, site) => {
          const cats: Record<string, number> = {};
          sourcesAgg(ga, site).forEach((x) => (cats[x.cat] = (cats[x.cat] || 0) + x.sessions));
          return Object.keys(cats).map((k) => [k, cats[k]] as [string, number]).sort((a, b) => b[1] - a[1]);
        }} />
        <GaRank title="Top sources" max={6} build={(ga, site) => sourcesAgg(ga, site).map((x) => [x.name, x.sessions, `${n(x.sessions)} visits`])} />
      </div>
      <div className={cols2}>
        <GaRank title="Top pages" max={6} build={(ga, site) => group(rep(ga, "pages"), [1], site).map((x) => [x.k[0], x.m[0], `${n(x.m[0])} views`])} />
        <GscRank title="Top Google searches" max={6} empty="No Search Console data yet." build={(g, site) => gscMerge(g, site, "queries", 1).map((r) => [String(r[0]), +r[1] + +r[2] / 1e6, `${n(r[1])} clicks`])} />
      </div>
      <Sites />
      <MoreNumbers />
      <GscMissingNote />
    </>
  );
}
