"use client";

import Link from "next/link";
import { SITES } from "@/lib/config";
import { useMemo } from "react";
import { useGA, useGSC } from "@/lib/data";
import { n, quickWins } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { STATUS_HELP, STATUS_LABEL, daysFor, peopleOf, usePulse, type Status, type Summary } from "@/lib/pulse";
import { CHANGES, botCheck, effects } from "@/lib/insights";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
/** A row inside the compact insight list on Home (the list card draws the box and the dividers). */
export const rowCls = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[.04]";
const btnMain = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand/15 px-4 text-[13.5px] font-semibold text-brand active:scale-[.98]";
const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim first:mt-0">{children}</h3>;

function Row({ icon, title, sub, value }: { icon: "live" | "search" | "health"; title: string; sub: string; value: string }) {
  return (
    <>
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-white/[.06] text-mute"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-dim">{sub}</span>
      </span>
      <span className="w-14 flex-none text-right font-mono text-[16px] font-semibold tabular-nums">{value}</span>
      <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
    </>
  );
}

/* ---- real visitors ---- */
/** The tracker's verdict for the chosen period: how many visits were a person. */
function usePulseVerdict() {
  const f = useFilters();
  const days = daysFor(f.range);
  const params = useMemo(() => ({ days, site: f.site === "all" ? undefined : f.site, who: "all" }), [days, f.site]);
  const sum = usePulse<Summary>("/v/summary", params).data;
  const by = (s: Status) => peopleOf(sum?.status, s);
  const total = by("real") + by("unclear") + by("bot");
  return { sum, total, real: by("real"), unclear: by("unclear"), bot: by("bot"), days };
}

function PulseVerdict() {
  const v = usePulseVerdict();
  if (!v.sum || !v.total) return null;
  const sites = new Map<string, Record<Status, number>>();
  v.sum.bySite.forEach((r) => {
    const o = sites.get(r.site) ?? { real: 0, unclear: 0, bot: 0 };
    o[r.status] += r.n;
    sites.set(r.site, o);
  });
  const list = [...sites.entries()].sort((a, b) => b[1].real + b[1].unclear + b[1].bot - (a[1].real + a[1].unclear + a[1].bot));
  return (
    <div className="mb-6">
      <p className="m-0 text-[15px] leading-relaxed text-mute"><b className="text-[28px] text-ink">{Math.round((100 * (v.real + v.unclear)) / v.total)}%</b> of {n(v.total)} visitors in the last {v.days} days were real people, counted by our own tracker: {n(v.real)} interacted and {n(v.unclear)} only looked or left quickly. {n(v.bot)} were known bots.</p>
      <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-dim">{STATUS_LABEL.real}: {STATUS_HELP.real} Counting began on the day each site got the tracker, so this fills in over the next days.</p>
      <ul className="m-0 mt-3 list-none p-0">
        {list.map(([h, o]) => {
          const tt = o.real + o.unclear + o.bot;
          return (
            <li key={h} className="border-t border-white/[.06] py-3 first:border-t-0">
              <div className="flex items-baseline justify-between gap-3"><span className="text-[15px] font-semibold">{SITES[h] ?? h}</span><span className="font-mono text-[13px] text-mute">{n(o.real + o.unclear)} real of {n(tt)}</span></div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                <i className="block h-full bg-good" style={{ width: `${(100 * o.real) / tt}%` }} /><i className="block h-full" style={{ width: `${(100 * o.unclear) / tt}%`, background: "var(--s3)" }} /><i className="block h-full bg-bad" style={{ width: `${(100 * o.bot) / tt}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <Link href="/watch/" className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand/10 text-[13.5px] font-semibold text-brand">See who they are and what they click</Link>
    </div>
  );
}

function VisitorsSheet() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const rows = botCheck(ga, f.site);
  if (!rows.length) return <div><PulseVerdict /><p className="m-0 text-[15px] text-mute">No Google Analytics numbers are loaded yet. Tap Refresh under Google Analytics.</p></div>;
  const total = rows.reduce((t, r) => t + r.sessions, 0), eng = rows.reduce((t, r) => t + r.engaged, 0);
  return (
    <div>
      <PulseVerdict />
      <H>Google Analytics view (a hint, not proof)</H>
      <p className="m-0 text-[15px] leading-relaxed text-mute"><b className="text-[28px] text-ink">{total ? Math.round((100 * eng) / total) : 0}%</b> of {n(total)} visits were real, engaged visits. An engaged visit lasts 10 seconds, opens 2 pages or does a key action. Bots usually load one page and leave.</p>
      <H>Visits, engaged visits, actions</H>
      <ul className="m-0 list-none p-0">
        {rows.map((r) => (
          <li key={r.host} className="border-t border-white/[.06] py-3.5 first:border-t-0">
            <div className="flex items-baseline justify-between gap-3"><span className="text-[15px] font-semibold">{SITES[r.host] ?? r.host}</span><span className={`font-mono text-[13px] ${r.suspect ? "text-bad" : "text-mute"}`}>{Math.round(100 * r.rate)}% engaged</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><i className={`block h-full rounded-full ${r.suspect ? "bg-bad" : "bg-brand"}`} style={{ width: `${Math.max(3, 100 * r.rate)}%` }} /></div>
            <p className="m-0 mt-1.5 text-[12.5px] text-dim">{n(r.sessions)} visits → {n(r.engaged)} engaged → {n(r.actions)} actions ({(100 * r.actionRate).toFixed(1)}% of visits){r.suspect ? ". Looks like bots." : ""}</p>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-dim">Under 15% engaged with 30 or more visits is flagged. It is a hint, not proof: a quick answer page can have low engagement from real people too.</p>
    </div>
  );
}
export function RealVisitorsLink() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const v = usePulseVerdict();
  const rows = botCheck(ga, f.site);
  const total = rows.reduce((t, r) => t + r.sessions, 0), eng = rows.reduce((t, r) => t + r.engaged, 0);
  const sus = rows.filter((r) => r.suspect).length;
  if (v.total > 0) {
    return (
      <PopBox id="real-visitors" title="Real visitors" radius={20} className={rowCls} label="Real visitors and funnel" render={() => <VisitorsSheet />}>
        <Row icon="live" title="Real visitors" sub={`${n(v.real + v.unclear)} of ${n(v.total)} were people`} value={`${Math.round((100 * (v.real + v.unclear)) / v.total)}%`} />
      </PopBox>
    );
  }
  return (
    <PopBox id="real-visitors" title="Real visitors" radius={20} className={rowCls} label="Real visitors and funnel" render={() => <VisitorsSheet />}>
      <Row icon="live" title="Real visitors" sub={rows.length ? (sus ? `${sus} ${sus === 1 ? "site looks" : "sites look"} like bots` : "Engaged visits, by site") : "Loads with Google Analytics"} value={rows.length && total ? `${Math.round((100 * eng) / total)}%` : "–"} />
    </PopBox>
  );
}

/* ---- closest to page one ---- */
function WinsSheet() {
  const f = useFilters();
  const g = useGSC(f.range).data;
  const wins = quickWins(g, f.site).slice(0, 25);
  if (!wins.length) return <p className="m-0 text-[15px] text-mute">No searches in this range sit just off the top yet. Wait for more impressions, or pick a longer range.</p>;
  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute">Searches where Google already shows your page, but not at the top. A better title or a clearer answer on these pages is the cheapest way to get more clicks.</p>
      <ul className="m-0 mt-3 list-none p-0">
        {wins.map((w) => (
          <li key={w.query + w.page} className="border-t border-white/[.06] py-3.5 first:border-t-0">
            <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words text-[15px] font-semibold">{w.query}</span><span className="flex-none font-mono text-[12.5px] text-good">+{w.extra}</span></div>
            <p className="m-0 mt-0.5 break-all font-mono text-[12px] text-dim">{path(w.page)}</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-mute">Position {w.pos.toFixed(1)}, {n(w.impr)} views, {n(w.clicks)} clicks</p>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[12.5px] text-dim">+N is the extra clicks you would get if the page reached about a 10% click rate.</p>
      <Link href="/rankings/" className={`${btnMain} mt-4 w-full`}>Open the Rankings page</Link>
    </div>
  );
}
export function WinsLink() {
  const f = useFilters();
  const g = useGSC(f.range).data;
  const k = quickWins(g, f.site).length;
  return (
    <PopBox id="wins" title="Closest to page one" radius={20} className={rowCls} label="Closest to page one" render={() => <WinsSheet />}>
      <Row icon="search" title="Closest to page one" sub={g ? "Searches you almost win" : "Loads with Search Console"} value={g ? String(k) : "–"} />
    </PopBox>
  );
}

/* ---- what changed ---- */
function ChangesSheet() {
  const f = useFilters();
  const g = useGSC(f.range).data;
  const list = effects(g, CHANGES.filter((c) => f.site === "all" || c.host === f.site));
  if (!list.length) return <p className="m-0 text-[15px] text-mute">No changes are recorded for this site.</p>;
  const per = (x: { clicks: number; impr: number; days: number }) => (x.days ? { c: x.clicks / x.days, i: x.impr / x.days } : { c: 0, i: 0 });
  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute">What we shipped, and how Google views and clicks per day compare for the 7 days before and the days since. Google reports 2 to 3 days late, and small numbers move by chance, so read this as a hint.</p>
      <ul className="m-0 mt-3 list-none p-0">
        {list.map((e) => {
          const b = per(e.before), a = per(e.after);
          return (
            <li key={e.change.date + e.change.text} className="border-t border-white/[.06] py-3.5 first:border-t-0">
              <div className="font-mono text-[11px] text-dim">{e.change.date} · {SITES[e.change.host] ?? e.change.host}</div>
              <div className="text-[15px] font-semibold leading-snug">{e.change.text}</div>
              {e.state === "ok" && <p className="m-0 mt-1 text-[13.5px] text-mute">Views per day {b.i.toFixed(0)} → <b className="text-ink">{a.i.toFixed(0)}</b> · clicks per day {b.c.toFixed(1)} → <b className="text-ink">{a.c.toFixed(1)}</b> <span className="text-dim">({e.after.days} days of data since)</span></p>}
              {e.state === "early" && <p className="m-0 mt-1 text-[13.5px] text-dim">Too early to tell: only {e.after.days} days of Google data since this change.</p>}
              {e.state === "outside" && <p className="m-0 mt-1 text-[13.5px] text-dim">This change is outside the range you are viewing. Pick a longer range.</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
export function ChangesLink() {
  return (
    <PopBox id="changes" title="What changed" radius={20} className={rowCls} label="What changed and what happened after" render={() => <ChangesSheet />}>
      <Row icon="health" title="What changed" sub="Changes and their results" value={String(CHANGES.length)} />
    </PopBox>
  );
}

export default function InsightLinks() {
  return (
    <>
      <RealVisitorsLink />
      <WinsLink />
      <ChangesLink />
    </>
  );
}
