"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SITES, STREAMS } from "@/lib/config";
import { useAlerts, useCrawl, useGA, useHealth, useLive } from "@/lib/data";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { actionLine, actionTotals, buildIssues, type Issue } from "@/lib/issues";
import { peopleByHost, todayBy } from "@/lib/today";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";
import { IssueSheet } from "./IssueSheet";

const DOT: Record<Issue["level"], string> = { bad: "bg-bad", warn: "bg-yellow-400", info: "bg-brand", good: "bg-good" };
const WORD: Record<Issue["level"], string> = { bad: "Problem", warn: "Needs a look", info: "Good to know", good: "Good news" };

function Bar({ label, value, max, suffix = "" }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0 truncate">{label}</span><b className="font-mono text-[13px]">{n(value)}{suffix}</b></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><i className="block h-full rounded-full bg-brand" style={{ width: `${max ? Math.max(4, (100 * value) / max) : 0}%` }} /></div>
    </li>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim first:mt-0">{children}</h3>;

/** Everything happening on the sites in the last 30 minutes. */
function OnlineSheet({ site }: { site: string }) {
  const l = useLive().data;
  if (!l) return <p className="sub">Loading…</p>;
  const mine = (x: unknown) => site === "all" || STREAMS[String(x)] === SITES[site];
  const by = l.streams.rows.filter((r) => mine(r[0])).map((r) => ({ name: STREAMS[String(r[0])] || String(r[0]), v: +r[1] || 0 })).sort((a, b) => b.v - a.v);
  const pages = l.pages.rows.filter((r) => mine(r[0])).slice(0, 8);
  const ctry = l.countries.rows.slice(0, 6);
  const total = by.reduce((a, x) => a + x.v, 0);
  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute"><b className="text-[28px] text-ink">{n(total)}</b> {total === 1 ? "person is" : "people are"} on your sites right now (last 30 minutes).</p>
      <H>By site</H>
      <ul className="m-0 list-none p-0">{by.length ? by.map((x) => <Bar key={x.name} label={x.name} value={x.v} max={by[0].v} />) : <li className="text-[14px] text-dim">Nobody right now.</li>}</ul>
      <H>Pages being viewed</H>
      <ul className="m-0 list-none p-0">{pages.length ? pages.map((r, i) => <Bar key={i} label={String(r[1])} value={+r[2] || 0} max={+pages[0][2] || 1} />) : <li className="text-[14px] text-dim">Nothing right now.</li>}</ul>
      <H>Where they are</H>
      <ul className="m-0 list-none p-0">{ctry.length ? ctry.map((r, i) => <Bar key={i} label={String(r[0] || "(unknown)")} value={+r[1] || 0} max={+ctry[0][1] || 1} />) : <li className="text-[14px] text-dim">Nothing right now.</li>}</ul>
      <Link href="/live/" className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand/10 text-[13.5px] font-semibold text-brand">Open the full live screen</Link>
    </div>
  );
}

/** The latest day's visitors, site by site, and the pages being read right now. */
function TodaySheet({ site, range }: { site: string; range: string }) {
  const ga = useGA(range).data;
  const l = useLive().data;
  const t = useMemo(() => todayBy(ga, site), [ga, site]);
  if (!ga) return <p className="sub">Loading…</p>;
  if (!t) return <p className="sub">Google Analytics has no daily numbers yet.</p>;
  const pages = (l?.pages.rows ?? []).slice(0, 8);
  const d = new Date(t.date + "T00:00:00");
  const day = Number.isNaN(+d) ? t.date : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute"><b className="text-[28px] text-ink">{n(t.people)}</b> {t.people === 1 ? "person" : "people"} made <b className="text-ink">{n(t.visits)}</b> {t.visits === 1 ? "visit" : "visits"} on {day}. Google fills a day in gradually, so today only grows.</p>
      <H>Visits by site</H>
      <ul className="m-0 list-none p-0">{t.rows.length ? t.rows.map((r) => <Bar key={r.name} label={r.name} value={r.visits} max={t.rows[0].visits || 1} />) : <li className="text-[14px] text-dim">No visits yet today.</li>}</ul>
      <H>Being read right now</H>
      <ul className="m-0 list-none p-0">{pages.length ? pages.map((r, i) => <Bar key={i} label={String(r[1])} value={+r[2] || 0} max={+pages[0][2] || 1} />) : <li className="text-[14px] text-dim">Nothing right now.</li>}</ul>
      <Link href="/pages/" className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand/10 text-[13.5px] font-semibold text-brand">See the most visited pages</Link>
    </div>
  );
}

/** Every issue and piece of good news. Tap one to see exactly what to do, without leaving the popup. */
function NeedsSheet({ issues }: { issues: Issue[] }) {
  const [sel, setSel] = useState<Issue | null>(null);
  if (sel) return (
    <div>
      <button type="button" onClick={() => setSel(null)} className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-card2 pl-2 pr-3.5 text-[13px] font-semibold text-mute"><Icon name="chevron" className="h-4 w-4 rotate-90" />All items</button>
      <IssueSheet issue={sel} />
    </div>
  );
  if (!issues.length) return <p className="m-0 text-[15px] leading-relaxed text-mute">Nothing needs you right now. Everything checked is fine.</p>;
  const t = actionTotals(issues);
  return (
    <>
    <p className="m-0 mb-4 text-[15px] leading-relaxed text-mute"><b className="text-ink">{actionLine(t)}.</b> {t.groups ? `They fall into ${t.groups} ${t.groups === 1 ? "group" : "groups"}. Tap one to see what to do.` : ""}</p>
    <ul className="m-0 list-none space-y-2.5 p-0">
      {issues.map((x) => (
        <li key={x.id}>
          <button type="button" onClick={() => setSel(x)} className="flex w-full items-start gap-3 rounded-2xl bg-white/[.04] p-4 text-left active:bg-white/[.08]">
            <i className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full ${DOT[x.level]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[10.5px] uppercase tracking-wider text-dim">{WORD[x.level]}</span>
              <span className="block text-[15px] font-semibold leading-snug">{x.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-dim">{x.count && x.pages.length ? `${x.count.toLocaleString("en-US")} ${x.count === 1 ? "page" : "pages"}. ` : ""}{x.steps.length ? "Tap to see what to do" : "Tap for details"}</span>
            </span>
            <Icon name="chevron" className="mt-1.5 h-4 w-4 flex-none -rotate-90 text-dim" />
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}

const Label = ({ dot, pulse, children }: { dot: string; pulse?: boolean; children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-mute"><i className={`h-2 w-2 flex-none rounded-full max-[379px]:hidden ${dot} ${pulse ? "animate-pulseglow" : ""}`} aria-hidden="true" />{children}</div>
);
const Body = ({ label, big, small }: { label: React.ReactNode; big: string; small: string }) => (
  <div className="flex h-full flex-col justify-between">
    {label}
    <div className="text-[28px] font-bold leading-none tracking-tight">{big}</div>
    <div className="truncate text-[11.5px] leading-none text-dim">{small}</div>
  </div>
);

/** Three small boxes at the top of Home. Each unfolds into a popup. */
export default function QuickBoxes() {
  const f = useFilters();
  const live = useLive().data;
  const ga = useGA(f.range).data;
  const health = useHealth().data;
  const crawl = useCrawl().data;
  const alerts = useAlerts().data;
  const online = useMemo(() => (live?.streams.rows ?? []).filter((r) => f.site === "all" || STREAMS[String(r[0])] === SITES[f.site]).reduce((a, r) => a + (+r[1] || 0), 0), [live, f.site]);
  const today = useMemo(() => todayBy(ga, f.site), [ga, f.site]);
  const issues = useMemo(() => buildIssues({ site: f.site, health, crawl, alerts, live, peopleBy: peopleByHost(ga) }), [f.site, health, crawl, alerts, live, ga]);
  const totals = actionTotals(issues);
  const todoN = totals.pages + totals.jobs;
  const worst = issues[0]?.level;
  const box = "card !border-transparent !p-3.5 h-[100px] w-full";
  const needDot = todoN ? (worst === "bad" ? "bg-bad" : "bg-yellow-400") : "bg-good";

  return (
    <div className="grid grid-cols-3 gap-3">
      <PopBox id="online" title="Online now" radius={18} className={box} render={() => <OnlineSheet site={f.site} />} label={`Online now: ${online}`}>
        <Body label={<Label dot="bg-good" pulse>Online now</Label>} big={live ? n(online) : "–"} small="right now" />
      </PopBox>
      <PopBox id="today" title="Visited today" radius={18} className={box} render={() => <TodaySheet site={f.site} range={f.range} />} label={`Visited today: ${today?.people ?? 0}`}>
        <Body label={<Label dot="bg-brand">Visited today</Label>} big={today ? n(today.people) : "–"} small={today ? `${n(today.visits)} ${today.visits === 1 ? "visit" : "visits"}` : "tap to see"} />
      </PopBox>
      <PopBox id="needs" title="Needs a look" radius={18} className={`${box} ${todoN ? (worst === "bad" ? "!bg-bad/[.09]" : "!bg-yellow-400/[.09]") : ""}`} render={() => <NeedsSheet issues={issues} />} label={`Needs a look: ${actionLine(totals)}`}>
        <Body label={<Label dot={needDot}>Needs a look</Label>} big={todoN.toLocaleString("en-US")} small={todoN ? (totals.pages ? "pages to fix" : "to fix") : "all clear"} />
      </PopBox>
    </div>
  );
}
