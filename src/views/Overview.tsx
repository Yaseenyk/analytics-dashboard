"use client";

import { useState } from "react";
import { BRAND, CAT_COLOR, COLORS, SITES, STREAMS, gscProperty } from "@/lib/config";
import { useGA, useGSC, useLive } from "@/lib/data";
import {
  classify, daily, dailyAll, dailyTotal, dur, gscDaily, gscMerge, gscMissing, gscTotals, group, hasGA, ix, label, n, pct, rep, sourcesAgg, sum,
} from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { Banner, Card, Delta, Sk, SkCard, SkText, Wait } from "@/components/ui";
import { GaArea, GaDonut, GaKpi, GaRank, GscKpi, GscRank, cols2, grid4, useGaMemo, useGscMemo } from "./kit";

function GaBanner() {
  const { v } = useGaMemo((ga) => !hasGA(ga));
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
        <span className="text-[12.5px] text-dim">online now (last 30 min)</span>
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
  return (
    <Card title="In plain words">
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-mute marker:text-dim">
        <li>
          <b className="text-ink">{n(v.usr)}</b> {v.usr === 1 ? "person" : "people"} visited <b className="text-ink">{n(v.ses)}</b> {v.ses === 1 ? "time" : "times"}
          {v.usr > 1 ? ` (${(v.ses / v.usr).toFixed(1)} visits each)` : ""}, last {v.days} days. <b className="text-ink">{Math.min(100, pct(v.nu, v.usr)).toFixed(0)}%</b> {v.usr === 1 ? "was" : "were"} new.
        </li>
        {v.src.length > 0 && (
          <li>
            Most came from{" "}
            {v.src.slice(0, 3).map((x, i) => (
              <span key={x.name}>{i ? ", " : ""}<b className="text-ink">{x.name === "(not set)" ? "Unassigned" : x.name}</b> ({pct(x.sessions, v.tot).toFixed(0)}%)</span>
            ))}
            .
          </li>
        )}
        <li>
          {v.aiN
            ? <><b className="text-ink">{n(v.aiN)}</b> visits came from AI assistants ({v.ai.slice(0, 3).map((x) => `${x.name} ${n(x.sessions)}`).join(", ")}).</>
            : "No visits from AI assistants such as ChatGPT or Perplexity yet."}
        </li>
        <li>
          <b className="text-ink">{n(v.ev.generate_lead || 0)}</b> sign-ups and forms, <b className="text-ink">{n(v.ev.whatsapp_click || 0)}</b> WhatsApp taps, <b className="text-ink">{n(v.key)}</b> key events in all.
        </li>
      </ul>
    </Card>
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

function SiteCard({ host }: { host: string }) {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const gs = useGSC(f.range).data;
  const live = useLive().data;
  const t = rep(ga, "totals");
  const rows = t.rows.filter((r) => r[ix(t, "hostName")] === host);
  const nd0 = t.dims.length;
  const m = (nm: string) => rows.reduce((s, r) => s + (+r[nd0 + t.mets.indexOf(nm)] || 0), 0);
  const s = gs?.search?.[gscProperty(host)];
  const lv = (live?.streams.rows ?? []).filter((r) => STREAMS[String(r[0])] === SITES[host]).reduce((a, r) => a + +r[1], 0);
  const ready = !!ga && hasGA(ga);
  const gOk = !!(s && s.ok && s.total);
  const cell = (k: string, v: string | null) => (
    <div className="min-w-0">
      <small className="block text-[11px] text-dim">{k}</small>
      {v === null ? <Sk w={60} h={14} className="mt-1" /> : <b className="text-[15px]">{v}</b>}
    </div>
  );
  return (
    <button type="button" onClick={() => f.setSite(host)} className="card animate-fadein text-left transition-colors hover:border-brand/35">
      <h3 className="m-0 text-[15px] font-semibold">{SITES[host]}</h3>
      <div className="mb-3 font-mono text-[11.5px] text-dim">{host}</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        {cell("People", !ga ? null : ready ? n(m("activeUsers")) : "–")}
        {cell("Visits", !ga ? null : ready ? n(m("sessions")) : "–")}
        {cell("Online", live ? String(lv) : null)}
        {cell("Clicks", !gs ? null : gOk ? n(s!.total![0]) : "–")}
        {cell("Impr.", !gs ? null : gOk ? n(s!.total![1]) : "–")}
        {cell("Position", !gs ? null : gOk ? String(s!.total![3]) : "–")}
      </div>
    </button>
  );
}

function Sites() {
  const f = useFilters();
  if (f.site !== "all") return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="h2">Your sites</h2>
        <span className="text-[12.5px] text-dim">Tap one to see only that site</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.keys(SITES).map((h) => <SiteCard key={h} host={h} />)}
      </div>
    </div>
  );
}

function MoreNumbers() {
  const mk = (title: string, id: string, calc: (ga: Parameters<typeof rep>[0], site: string, cmp: boolean) => { value: string; delta?: React.ReactNode }) => (
    <GaKpi key={id} title={title} id={id} calc={(ga, site, cmp) => (hasGA(ga) ? calc(ga, site, cmp) : { value: "–" })} />
  );
  const gk = (title: string, id: string, field: "impr" | "ctr" | "pos") => (
    <GscKpi
      key={id}
      title={title}
      id={id}
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
        <span aria-hidden="true" className="text-dim transition-transform group-open:rotate-180">⌄</span>
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
      <GaBanner />
      <LiveCard />
      <div className={grid4}>
        <GaKpi title="People" id="people" color={COLORS[0]} calc={(ga, site, cmp) => {
          const ok = hasGA(ga);
          return { value: ok ? n(total(ga, "activeUsers", site)) : "–", delta: ok ? <Delta show={cmp} cur={total(ga, "activeUsers", site)} prev={total(ga, "activeUsers", site, true)} /> : <Wait />, spark: dailyTotal(rep(ga, "daily"), "activeUsers", site) };
        }} />
        <GaKpi title="Visits" id="visits" color={COLORS[1]} calc={(ga, site, cmp) => {
          const ok = hasGA(ga);
          return { value: ok ? n(total(ga, "sessions", site)) : "–", delta: ok ? <Delta show={cmp} cur={total(ga, "sessions", site)} prev={total(ga, "sessions", site, true)} /> : <Wait />, spark: dailyTotal(rep(ga, "daily"), "sessions", site) };
        }} />
        <GaKpi title="Leads and clicks" id="leads" color={COLORS[2]} calc={(ga, site, cmp) => {
          const ok = hasGA(ga);
          return { value: ok ? n(total(ga, "keyEvents", site)) : "–", delta: ok ? <Delta show={cmp} cur={total(ga, "keyEvents", site)} prev={total(ga, "keyEvents", site, true)} /> : <Wait />, spark: dailyTotal(rep(ga, "daily"), "keyEvents", site) };
        }} />
        <GscKpi title="Google clicks" id="gclicks" color={COLORS[3]} calc={(g, site, cmp) => {
          const a = gscTotals(g, site, false), b = gscTotals(g, site, true);
          return { value: n(a.clicks), delta: <Delta show={cmp} cur={a.clicks} prev={b.clicks} />, spark: gscDaily(g, site).map((x) => x.clicks) };
        }} />
      </div>
      <Summary />
      <VisitsChart />
      <div className={cols2}>
        <GaDonut title="Where visitors come from" colorOf={(nm, i) => CAT_COLOR[nm] || COLORS[i % COLORS.length]} build={(ga, site) => {
          const cats: Record<string, number> = {};
          sourcesAgg(ga, site).forEach((x) => (cats[x.cat] = (cats[x.cat] || 0) + x.sessions));
          return Object.keys(cats).map((k) => [k, cats[k]] as [string, number]).sort((a, b) => b[1] - a[1]);
        }} />
        <GaRank title="Top sources" max={6} note="Direct / unknown means the browser gave no source, for example a link opened in an app." build={(ga, site) => sourcesAgg(ga, site).map((x) => [x.name, x.sessions, `${n(x.sessions)} visits`])} />
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
