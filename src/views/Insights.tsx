"use client";

import Link from "next/link";
import { SITES } from "@/lib/config";
import { useGA, useGSC } from "@/lib/data";
import { n, quickWins } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { CHANGES, botCheck, effects } from "@/lib/insights";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const rowCls = "card flex w-full items-center gap-3 !border-transparent !p-4";
const btnMain = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand/15 px-4 text-[13.5px] font-semibold text-brand active:scale-[.98]";
const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim first:mt-0">{children}</h3>;

function Row({ icon, title, sub, value }: { icon: "live" | "search" | "health"; title: string; sub: string; value: string }) {
  return (
    <>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/[.06] text-mute"><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[12.5px] text-dim">{sub}</span>
      </span>
      <span className="font-mono text-[16px] font-semibold">{value}</span>
      <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
    </>
  );
}

/* ---- real visitors ---- */
function VisitorsSheet() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const rows = botCheck(ga, f.site);
  if (!rows.length) return <p className="m-0 text-[15px] text-mute">No visitor numbers are loaded yet. Tap Updated at the top.</p>;
  const total = rows.reduce((t, r) => t + r.sessions, 0), eng = rows.reduce((t, r) => t + r.engaged, 0);
  return (
    <div>
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
  const rows = botCheck(ga, f.site);
  const total = rows.reduce((t, r) => t + r.sessions, 0), eng = rows.reduce((t, r) => t + r.engaged, 0);
  const sus = rows.filter((r) => r.suspect).length;
  return (
    <PopBox id="real-visitors" title="Real visitors" radius={20} className={rowCls} label="Real visitors and funnel" render={() => <VisitorsSheet />}>
      <Row icon="live" title="Real visitors" sub={rows.length ? (sus ? `${sus} ${sus === 1 ? "site looks" : "sites look"} like bots. Tap to see.` : "Visits that were really engaged, by site.") : "Loads with the Google Analytics numbers."} value={rows.length && total ? `${Math.round((100 * eng) / total)}%` : "–"} />
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
      <Row icon="search" title="Closest to page one" sub={g ? "Searches you almost win. Tap to see which pages to improve." : "Loads with the Search Console numbers."} value={g ? String(k) : "–"} />
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
      <Row icon="health" title="What changed" sub="Our changes, and what Google did after each." value={String(CHANGES.length)} />
    </PopBox>
  );
}

export default function InsightLinks() {
  return (
    <div className="space-y-2.5">
      <RealVisitorsLink />
      <WinsLink />
      <ChangesLink />
    </div>
  );
}
