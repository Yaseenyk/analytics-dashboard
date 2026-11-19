"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { SITE_HOSTS } from "@/lib/config";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import {
  PULSE_API, WHY_LABEL, daysFor, peopleOf, pulsePost, regionName, useKey, usePulse,
  type ClickMap, type FeedRow, type Goals, type Insights, type Journey, type Live, type Status, type Summary,
} from "@/lib/pulse";
import { Card, Sk } from "@/components/ui";
import { AlertsCard, Broken, CrossCheck, Flow, Landing, PagesDeep, SourceQuality, When } from "./WatchDeep";
import { GoalsCard } from "./WatchGoals";
import { Badge, CLICK_LABEL, COLOR, KIND_LABEL, ORDER, Rows, ago, offset, pct, say, secs, site, when } from "./watchkit";
import { DataTable } from "@/components/DataTable";

function Daily({ rows }: { rows: Summary["daily"] }) {
  const days = useMemo(() => {
    const m = new Map<string, Record<Status, number>>();
    rows.forEach((r) => {
      const o = m.get(r.day) ?? { real: 0, unclear: 0, bot: 0 };
      o[r.status] += r.n;
      m.set(r.day, o);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  if (!days.length) return null;
  const max = Math.max(...days.map(([, o]) => o.real + o.unclear + o.bot), 1);
  return (
    <Card title="People per day" note="Green is a real person, amber did nothing, red is a bot. Each person counts once a day. Days are in Indian time.">
      <div className="mt-3 flex h-36 items-end gap-[3px]" role="img" aria-label="People per day, split into real people, no interaction and bots">
        {days.map(([d, o]) => (
          <div key={d} title={`${d}: ${o.real} real, ${o.unclear} no interaction, ${o.bot} bots`} className="flex h-full min-w-[3px] max-w-10 flex-1 flex-col-reverse overflow-hidden rounded-t">
            {ORDER.map((s) => <i key={s} style={{ height: `${(100 * o[s]) / max}%`, background: COLOR[s] }} className="block w-full" />)}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-dim"><span>{days[0]![0]}</span><span>{days[days.length - 1]![0]}</span></div>
    </Card>
  );
}

function Journeys({ row, keyStr, onMarked }: { row: FeedRow; keyStr: string; onMarked: () => void }) {
  const params = useMemo(() => ({ sid: row.sid }), [row.sid]);
  const { data } = usePulse<Journey>("/v/journey", params, { key: keyStr });
  const [busy, setBusy] = useState(false);
  if (!data) return <Sk w={200} h={14} className="m-3" />;
  const mark = async () => {
    setBusy(true);
    const ok = await pulsePost("/v/mine", { sid: row.sid, me: !row.me }, keyStr);
    setBusy(false);
    if (ok) onMarked();
  };
  return (
    <div className="border-t border-line px-3 py-3">
      <p className="m-0 mb-3 text-[12.5px] text-dim">This visitor’s steps in this browser tab, in order. {data.hits.length} page{data.hits.length === 1 ? "" : "s"}.</p>
      <button type="button" disabled={busy} onClick={mark} className="mb-3 min-h-9 rounded-lg bg-white/[.07] px-3 text-[12.5px] font-semibold text-ink disabled:opacity-50">
        {row.me ? "Not me: count this visit again" : "This was me: leave it out of the numbers"}
      </button>
      <ol className="m-0 list-none p-0">
        {data.hits.map((h, i) => {
          const cl = data.clicks.filter((c) => c.hid === h.id);
          return (
            <li key={h.id} className="relative pb-4 pl-6 last:pb-0">
              {i < data.hits.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-3 w-px bg-line" />}
              <i aria-hidden="true" className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full" style={{ background: COLOR[h.status] }} />
              <div className="text-[13.5px]">
                <span className="font-mono text-[11.5px] text-dim">{when(h.ts)}</span>
                <div><b>Opened</b> <span className="break-all">{site(h.site)}{h.path}</span></div>
                <div className="text-[12.5px] text-dim">came from {KIND_LABEL[h.ref_kind] ?? h.ref_kind}{h.ref_host ? ` (${h.ref_host})` : ""} · stayed {secs(h.active)} · scrolled {h.scroll}%</div>
              </div>
              {cl.length > 0 ? (
                <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                  {cl.map((c) => {
                    const t = say(c);
                    return (
                      <li key={c.n} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${t.tone === "strong" ? "bg-brand/10 text-ink" : "bg-white/[.03] text-mute"}`}>
                        <span aria-hidden="true" className="mr-1.5">{t.icon}</span>{t.text}
                        <span className="ml-1.5 whitespace-nowrap text-[11.5px] text-dim">{offset(c.ts, h.ts)}{c.sec ? ` · ${c.sec}` : ""}</span>
                        {c.z ? <span className="ml-1.5 text-[11.5px] font-semibold text-bad">clicked many times quickly</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="m-0 mt-1 text-[12.5px] text-dim">No clicks on this page.</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Who = Status | "people" | "all" | "me";
const WHO: { id: Who; label: string }[] = [
  { id: "people", label: "People" },
  { id: "real", label: "Real people" },
  { id: "unclear", label: "No interaction" },
  { id: "bot", label: "Bots" },
  { id: "all", label: "Everyone" },
  { id: "me", label: "Mine" },
];

function Feed({ keyStr, siteFilter, bots }: { keyStr: string; siteFilter: string; bots: number }) {
  const [who, setWho] = useState<Who>("people");
  const [onlyAct, setOnlyAct] = useState(false);
  const [open, setOpen] = useState("");
  const [bump, setBump] = useState(0); // asks for the list again straight after a visit is marked
  const params = useMemo(() => ({ limit: 60, site: siteFilter === "all" ? undefined : siteFilter, who: who === "all" ? undefined : who, r: bump || undefined }), [siteFilter, who, bump]);
  const { data, err } = usePulse<FeedRow[]>("/v/feed", params, { key: keyStr, poll: 10000 });
  const rows = data && onlyAct ? data.filter((r) => (r.ndl ?? 0) + (r.nout ?? 0) > 0) : data;
  const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold ${on ? "bg-brand/15 text-brand" : "bg-white/[.05] text-mute"}`;
  const th = "whitespace-nowrap border-b border-line px-3 py-2 text-left text-[11.5px] font-medium text-dim";
  const td = "whitespace-nowrap px-3 py-2.5 text-[12.5px] text-mute";
  const heads = ["Who", "Why", "Site", "First page", "Pages", "Came from", "Country", "Network", "Device", "On screen", "Active", "Read", "Taps", "Downloads", "Exits"];
  return (
    <Card title="Visits one by one" note="One line per visit, newest first, however many pages it opened. Slide the table sideways for more. Tap a line to see that person’s steps.">
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter visits">
        {WHO.map((s) => (
          <button key={s.id} type="button" aria-pressed={who === s.id} onClick={() => setWho(s.id)} className={chip(who === s.id)}>{s.label}</button>
        ))}
        <button type="button" aria-pressed={onlyAct} onClick={() => setOnlyAct(!onlyAct)} className={chip(onlyAct)}>Downloads and exits only</button>
      </div>
      {who === "people" && <p className="m-0 mt-2 text-[12.5px] text-dim">Bots are left out of this list{bots ? ` (${n(bots)} in this period)` : ""}. Tap Bots to see them, and the Why column says how each visit got its label.</p>}
      {who === "me" && <p className="m-0 mt-2 text-[12.5px] text-dim">Visits from your own devices. They are in no other number on this dashboard.</p>}
      {err === "key" && <p className="sub mt-3 text-bad">That key was not accepted.</p>}
      {!data && !err && <Sk w={300} h={14} className="mt-4" />}
      {rows && rows.length === 0 && <p className="sub mt-3">No visits like this yet.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-card pl-0`} scope="col">When</th>
                {heads.map((h) => <th key={h} className={th} scope="col">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => setOpen(open === r.id ? "" : r.id)} className="cursor-pointer border-b border-line hover:bg-white/[.04]" aria-expanded={open === r.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card py-2.5 pr-3 text-[12.5px]" title={when(r.last)}>
                      <span aria-hidden="true" className="mr-1.5 text-[10px] text-brand">{open === r.id ? "▼" : "▶"}</span>{ago(r.last)}
                    </td>
                    <td className="px-3 py-2.5"><Badge s={r.status} /></td>
                    <td className={td}>{r.why ? WHY_LABEL[r.why] : "–"}</td>
                    <td className={td}>{site(r.site)}</td>
                    <td className={`${td} text-ink`}>{r.path}</td>
                    <td className={td}>{r.pages ?? 1}</td>
                    <td className={td}>{KIND_LABEL[r.ref_kind] ?? r.ref_kind}{r.ref_host ? ` (${r.ref_host})` : ""}</td>
                    <td className={td}>{regionName(r.country)}</td>
                    <td className={td}>{r.org || "–"}</td>
                    <td className={td}>{r.device}, {r.browser}, {r.os}</td>
                    <td className={td}>{secs(r.seen ?? 0)}</td>
                    <td className={td}>{secs(r.active)}</td>
                    <td className={td}>{r.scroll}%</td>
                    <td className={td}>{r.nclicks}</td>
                    <td className={`${td} ${r.ndl ? "font-semibold text-brand" : ""}`}>{r.ndl ?? 0}</td>
                    <td className={`${td} ${r.nout ? "font-semibold text-brand" : ""}`}>{r.nout ?? 0}</td>
                  </tr>
                  {open === r.id && (
                    <tr className="border-b border-line">
                      <td colSpan={heads.length + 1} className="p-0"><div className="sticky left-0 w-[min(100vw-56px,680px)] max-w-full"><Journeys row={r} keyStr={keyStr} onMarked={() => { setOpen(""); setBump((b) => b + 1); }} /></div></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ClickMapCard({ keyStr, pages, days }: { keyStr: string; pages: Summary["pages"]; days: number }) {
  const [pick, setPick] = useState("");
  const [s, p] = pick.split("|");
  const params = useMemo(() => ({ site: s, path: p, days }), [s, p, days]);
  const { data } = usePulse<ClickMap>("/v/clickmap", params, { key: keyStr, enabled: !!pick });
  const deepest = Math.max(0, ...(data?.clicks.map((c) => c.y) ?? [0]));
  const maxY = Math.max(800, Math.ceil((deepest * 1.1) / 100) * 100);
  const top = useMemo(() => {
    const m = new Map<string, number>();
    data?.clicks.forEach((c) => {
      if (c.kind === "other") return;
      const k = `${CLICK_LABEL[c.kind] ?? c.kind}: ${c.label}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => ({ name, v }));
  }, [data]);
  const guides = [0, 25, 50, 75].map((g) => ({ g, px: Math.round((maxY * g) / 100 / 100) * 100 }));
  return (
    <Card title="Where people tap on a page" note="Pick a page. The list shows what was tapped most. The strip shows where on the page, top to bottom.">
      <select aria-label="Choose a page" value={pick} onChange={(e) => setPick(e.target.value)} className="mt-3 min-h-11 w-full rounded-xl bg-white/[.05] px-3 text-[14px]">
        <option value="">Choose a page</option>
        {pages.map((x) => <option key={`${x.site}|${x.path}`} value={`${x.site}|${x.path}`}>{site(x.site)} {x.path} ({x.n} visits)</option>)}
      </select>
      {pick && !data && <Sk w={240} h={14} className="mt-4" />}
      {data && (
        <>
          <p className="m-0 mt-4 text-[14px] text-mute"><b className="text-ink">{data.clicks.length}</b> taps from <b className="text-ink">{data.visits}</b> real visits{data.clicks.length >= 600 ? " (showing the latest 600)" : ""}.</p>
          <Rows rows={top} empty="No taps on buttons or links on this page yet." />
          {data.clicks.length > 0 && (
            <>
              <h3 className="m-0 mb-2 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim">Position on the page</h3>
              <div className="relative h-56 overflow-hidden rounded-lg bg-white/[.03]" role="img" aria-label="Tap positions from the top of the page to the bottom">
                {guides.map(({ g, px }) => (
                  <div key={g} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${g}%` }}>
                    <span className="absolute left-1.5 top-0.5 font-mono text-[10px] text-dim">{g === 0 ? "top of page" : `${px} px down`}</span>
                  </div>
                ))}
                {data.clicks.map((c, i) => (
                  <i key={i} title={`${CLICK_LABEL[c.kind] ?? c.kind}${c.label ? `: ${c.label}` : ""}`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
                    style={{ left: `${Math.min(97, Math.max(3, c.x))}%`, top: `${Math.min(97, Math.max(3, (100 * c.y) / maxY))}%`, background: c.z ? "var(--bad)" : c.kind === "other" ? "var(--dim)" : "var(--brand)" }} />
                ))}
              </div>
              <p className="sub">Cyan is a tap on something clickable, red is many quick taps, grey is a tap on something that does nothing.</p>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Unlock({ keyStr, setKey, onDevices }: { keyStr: string; setKey: (k: string) => void; onDevices?: () => void }) {
  const [v, setV] = useState("");
  if (keyStr) {
    return (
      <p className="sub flex flex-wrap items-center gap-2">
        Private views are unlocked on this phone.
        <button type="button" onClick={() => setKey("")} className="min-h-9 rounded-full bg-white/[.05] px-3 text-[13px] font-semibold text-mute">Lock again</button>
        {onDevices && <button type="button" onClick={onDevices} className="min-h-9 rounded-full bg-white/[.05] px-3 text-[13px] font-semibold text-mute">My devices</button>}
      </p>
    );
  }
  return (
    <Card title="See each visitor, one by one" note="The totals above are open. To see one person at a time (which page, what they tapped, what they downloaded) enter your Watch key. It is a 32-character code, and it stays only in this browser.">
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) setKey(v.trim()); }}>
        <input type="password" autoComplete="off" aria-label="Watch key" value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste your Watch key" className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/[.05] px-3 text-[14px]" />
        <button type="submit" className="min-h-11 rounded-xl bg-brand/15 px-5 text-[14px] font-semibold text-brand">Unlock</button>
      </form>
    </Card>
  );
}

const ME_STORE = "pulse-me-device";

/** One tap marks this phone or computer as the owner's on every site, so their own visits stay out of the numbers. */
function MyDevices({ mine, onMark, onUnmark, onHide }: { mine: Summary["mine"]; onMark: () => void; onUnmark: () => void; onHide: () => void }) {
  const link = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[14px] font-semibold";
  return (
    <Card title="Leave out my own visits" note="Do this once on each phone and computer you use. The page runs through your 13 sites, which takes about 20 seconds, and comes back here. From then on, visits from that device are left out of every number. This box hides itself once you tap Mark; the My devices button brings it back.">
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`${PULSE_API}/me?v=on&step=0`} onClick={onMark} className={`${link} bg-brand/15 text-brand`}>Mark this device as mine</a>
        <a href={`${PULSE_API}/me?v=off&step=0`} onClick={onUnmark} className={`${link} bg-white/[.05] text-mute`}>Unmark this device</a>
        <button type="button" onClick={onHide} className={`${link} bg-white/[.05] text-mute`}>Hide this box</button>
      </div>
      <p className="sub">
        {mine?.visits ? `${n(mine.visits)} of your own visits (${n(mine.hits)} pages) are left out in this period.` : "No visits from a marked device in this period yet."}{" "}
        If the page stops on one of your sites and does not come back, that browser still holds an older copy of the tracker script: try again in an hour. For a visit that already happened, open it in “Visits one by one” at the top and tap “This was me”.
      </p>
    </Card>
  );
}

/** "▲ 13 vs before": one short line, so every tile reads the same. */
const vs = (cur: number, prev: number) => {
  const d = cur - prev;
  return d === 0 ? "same as before" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} vs before`;
};
const tile = (label: string, value: string, sub: string, color: string, tone: "up" | "down" | "" = "") => (
  <div key={label} className="card flex flex-col !p-3.5">
    <div className="flex items-center gap-1.5 text-[12.5px] text-mute"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><span className="truncate">{label}</span></div>
    <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</div>
    <div className={`mt-2 truncate text-[12px] leading-4 ${tone === "up" ? "text-good" : tone === "down" ? "text-bad" : "text-dim"}`}>{sub}</div>
  </div>
);
const tone = (cur: number, prev: number) => (cur > prev ? "up" : cur < prev ? "down" : "");

export default function Watch() {
  const f = useFilters();
  const days = daysFor(f.range);
  const [keyStr, setKey] = useKey();
  const [meFlash, setMeFlash] = useState("");
  // "this device is marked" is remembered here only so the box can stay hidden; the sites keep their own flag
  const [marked, setMarkedState] = useState(false);
  const setMarked = (on: boolean) => {
    setMarkedState(on);
    try { on ? localStorage.setItem(ME_STORE, "1") : localStorage.removeItem(ME_STORE); } catch { /* storage can be blocked */ }
  };
  const params = useMemo(() => ({ days, site: f.site === "all" ? undefined : f.site }), [days, f.site]);
  const { data: sum, err } = usePulse<Summary>("/v/summary", params, { poll: 60000 });
  const { data: ins } = usePulse<Insights>("/v/insights", params, { poll: 60000 });
  const { data: goals } = usePulse<Goals>("/v/goals", params, { poll: 60000 });
  const liveParams = useMemo(() => ({ site: f.site === "all" ? undefined : f.site }), [f.site]);
  const { data: live } = usePulse<Live>("/v/live", liveParams, { poll: 10000 });

  // a link like /watch/?key=... unlocks this phone once, then the key is removed from the address bar
  useEffect(() => {
    try {
      const u = new URL(location.href);
      const k = u.searchParams.get("key");
      const me = u.searchParams.get("me"); // set when the "mark this device" walk comes back
      let saved = false;
      try { saved = localStorage.getItem(ME_STORE) === "1"; } catch { /* ignore */ }
      if (me === "on" || me === "off") {
        setMeFlash(me);
        saved = me === "on";
        try { saved ? localStorage.setItem(ME_STORE, "1") : localStorage.removeItem(ME_STORE); } catch { /* ignore */ }
      }
      setMarkedState(saved);
      if (k) setKey(k);
      if (k || me) { u.searchParams.delete("key"); u.searchParams.delete("me"); history.replaceState(null, "", u.pathname + u.search); }
    } catch { /* ignore */ }
  }, [setKey]);

  const counts = useMemo(() => {
    const o: Record<Status, number> = { real: 0, unclear: 0, bot: 0 };
    ORDER.forEach((s) => (o[s] = peopleOf(sum?.status, s)));
    return o;
  }, [sum]);
  const total = counts.real + counts.unclear + counts.bot;
  const real = sum?.status.find((r) => r.status === "real");
  const reporting = useMemo(() => new Set(sum?.bySite.map((r) => r.site)), [sum]);
  const perSite = useMemo(() => {
    const m = new Map<string, Record<Status, number>>();
    sum?.bySite.forEach((r) => {
      const o = m.get(r.site) ?? { real: 0, unclear: 0, bot: 0 };
      o[r.status] += r.n;
      m.set(r.site, o);
    });
    return [...m.entries()].sort((a, b) => b[1].real + b[1].unclear + b[1].bot - (a[1].real + a[1].unclear + a[1].bot));
  }, [sum]);
  const silent = f.site === "all" ? SITE_HOSTS.filter((h) => !reporting.has(h)) : [];
  const liveReal = live?.status.find((x) => x.status === "real")?.n ?? 0;
  const all = f.site === "all";
  const c = ins?.compare;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {sum ? (
          <>
            {tile("Real people", n(counts.real), c ? vs(c.real, c.prevReal) : "no earlier data", COLOR.real, c ? tone(c.real, c.prevReal) : "")}
            {tile("Took action", n(c?.wins ?? 0), c ? vs(c.wins, c.prevWins) : "no earlier data", "var(--brand)", c ? tone(c.wins, c.prevWins) : "")}
            {tile("Online now", n(liveReal), "this minute", COLOR.real)}
            {tile("Bots", n(counts.bot), `${pct(counts.bot, total)}% of all visitors`, COLOR.bot)}
          </>
        ) : err ? (
          <p className="sub col-span-2">Cannot reach the tracker right now.</p>
        ) : (
          <><Sk w="100%" h={84} /><Sk w="100%" h={84} /><Sk w="100%" h={84} /><Sk w="100%" h={84} /></>
        )}
      </div>
      <p className="sub !mt-0 px-1">
        Our own tracker, not Google, for the last {days} days. <b className="font-medium text-mute">Real people</b> touched, scrolled or typed, and each person counts once a day however many pages they open{c?.visits ? ` (${n(counts.real)} ${counts.real === 1 ? "person" : "people"} made ${n(c.visits)} visit${c.visits === 1 ? "" : "s"} and opened ${n(c.pages ?? 0)} page${c.pages === 1 ? "" : "s"})` : ""}. <b className="font-medium text-mute">Took action</b> is real people who tapped something. <b className="font-medium text-mute">Bots</b> are robots that never touched the page
        {sum ? `, and ${n(counts.unclear)} more ${counts.unclear === 1 ? "visitor" : "visitors"} did nothing${sum.idle && counts.unclear ? ` (${n(sum.idle.left)} left within 2 seconds, ${n(sum.idle.stayed)} stayed but never touched the page)` : ""}` : ""}. Arrows compare with the {days} days before.
        {sum && real ? ` A real visitor stays ${secs(real.active)} on a page and reads ${real.scroll ?? 0}% of it.` : ""}
        {sum?.mine?.visits ? ` Your own ${n(sum.mine.visits)} visit${sum.mine.visits === 1 ? " is" : "s are"} left out.` : ""} Days are in Indian time.
      </p>

      {meFlash && <p role="status" className="m-0 rounded-xl bg-brand/10 px-4 py-3 text-[13.5px] text-ink">{meFlash === "on" ? "Done. This device is now left out on all 13 sites." : "Done. This device counts as a normal visitor again."}</p>}
      {keyStr && <Feed keyStr={keyStr} siteFilter={f.site} bots={counts.bot} />}

      <AlertsCard ins={ins} />

      {sum && total === 0 && <Card title="No visits yet"><p className="sub mt-2">The tracker was just switched on, so numbers appear as visitors arrive.</p></Card>}

      {sum && total > 0 && (
        <>
          <Daily rows={sum.daily} />
          {goals && <GoalsCard g={goals} all={all} />}
          <DataTable
            title="Key moments: downloads, exits, contacts and goals"
            note="The biggest actions: a file downloaded, a link to another website, an email or phone tap, or a goal a page reported. Every other tap is in the list further down. Real people only."
            cols={["What happened", "Times", "Where", "When"]}
            fmt={[0, "n", 0, 0]}
            bar={1}
            max={10}
            empty="None yet. Download tracking started on 17 Nov 2026, so earlier ones were not recorded."
            rows={(sum.actions ?? []).map((a) => [say(a).text, a.n, `${all ? site(a.site) + " " : ""}${a.path}`, ago(a.last)])}
          />
          {ins && <SourceQuality ins={ins} />}
          {ins && <Landing ins={ins} />}
          {ins && <CrossCheck ins={ins} />}
          {ins && <PagesDeep ins={ins} all={all} />}
          {ins && <Flow ins={ins} all={all} />}
          {ins && <When ins={ins} />}
          <DataTable
            title="What real people tapped"
            note="Buttons and links, most tapped first."
            cols={["What", "Taps", "Quick repeats"]}
            fmt={[0, "n", "n"]}
            bar={1}
            max={10}
            empty="No taps on buttons or links yet."
            rows={sum.clicks.map((x) => [`${CLICK_LABEL[x.kind] ?? x.kind}: ${x.label || x.href || "(no label)"}`, x.n, x.rage ?? 0])}
          />
          <DataTable title="Countries" cols={["Country", "People"]} fmt={[0, "n"]} bar={1} max={10} rows={sum.countries.map((x) => [regionName(x.country), x.n])} />
          <DataTable title="Devices" cols={["Device", "People"]} fmt={[0, "n"]} bar={1} max={10} rows={sum.devices.map((d) => [`${d.device}, ${d.browser}`, d.n])} />
          <DataTable
            title="Your sites"
            note={silent.length ? `Not reporting yet: ${silent.map(site).join(", ")}.` : undefined}
            cols={["Site", "Real", "Did nothing", "Bots"]}
            fmt={[0, "n", "n", "n"]}
            bar={1}
            max={12}
            rows={perSite.map(([h, o]) => [site(h), o.real, o.unclear, o.bot])}
          />
          <DataTable
            title="Who the bots are"
            note="Every visit counted as a bot, by the network it came from and the reason. A visit with a real touch, key press or scroll is never in this list unless the browser itself says software is driving it."
            cols={["Network", "Visits", "Why it is a bot", "Longest time active", "Taps"]}
            fmt={[0, "n", 0, 0, "n"]}
            bar={1}
            max={8}
            empty="No bots in this period."
            rows={(sum.bots ?? []).map((b) => [b.org || "Unknown network", b.n, WHY_LABEL[b.why] ?? b.why, secs(b.active ?? 0), b.clicks ?? 0])}
          />
          {ins && <Broken ins={ins} all={all} />}
        </>
      )}

      <Unlock keyStr={keyStr} setKey={setKey} onDevices={marked ? () => setMarked(false) : undefined} />
      {keyStr && (
        <>
          {!marked && <MyDevices mine={sum?.mine} onMark={() => setMarked(true)} onUnmark={() => setMarked(false)} onHide={() => setMarked(true)} />}
          {sum && sum.pages.length > 0 && <ClickMapCard keyStr={keyStr} pages={sum.pages} days={days} />}
        </>
      )}
    </div>
  );
}
