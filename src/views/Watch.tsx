"use client";

import { useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import {
  STATUS_HELP, STATUS_LABEL, STATUS_ONE, daysFor, regionName, useKey, usePulse,
  type ClickMap, type FeedRow, type Journey, type Live, type Status, type Summary,
} from "@/lib/pulse";
import { Card, Sk } from "@/components/ui";

const COLOR: Record<Status, string> = { real: "var(--good)", unclear: "var(--s3)", bot: "var(--bad)" };
const ORDER: Status[] = ["real", "unclear", "bot"];
const KIND_LABEL: Record<string, string> = { search: "Search engines", social: "Social and messaging", ai: "AI assistants", direct: "Direct or unknown", own: "Your other sites", internal: "Same site", email: "Email", paid: "Paid", other: "Other websites" };
const CLICK_LABEL: Record<string, string> = { link: "Link", out: "Leaves the site", btn: "Button", tab: "Tab", input: "Form field", mail: "Email link", tel: "Phone link", other: "Not clickable" };
const site = (h: string) => SITES[h] ?? h;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const secs = (s: number | null | undefined) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const when = (ms: number) => {
  const d = new Date(ms);
  return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function Badge({ s }: { s: Status }) {
  return (
    <span title={STATUS_HELP[s]} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[.06] px-2 py-0.5 text-[11.5px] font-semibold">
      <i className="h-2 w-2 rounded-full" style={{ background: COLOR[s] }} />
      {STATUS_ONE[s]}
    </span>
  );
}

function Rows({ rows, empty = "Nothing yet." }: { rows: { name: string; v: number; note?: string }[]; empty?: string }) {
  if (!rows.length) return <p className="sub">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {rows.map((r) => (
        <li key={r.name} className="py-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate">{r.name}</span>
            <b className="font-mono text-[13px]">{n(r.v)}{r.note && <span className="ml-2 font-normal text-dim">{r.note}</span>}</b>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><i className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (100 * r.v) / max)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function RightNow({ siteFilter }: { siteFilter: string }) {
  const params = useMemo(() => ({ site: siteFilter === "all" ? undefined : siteFilter }), [siteFilter]);
  const { data, err } = usePulse<Live>("/v/live", params, { poll: 10000 });
  const by = (s: Status) => data?.status.find((x) => x.status === s)?.n ?? 0;
  return (
    <Card title="On the sites right now" note="Updates by itself every 10 seconds. A visit counts as online until it has been quiet for 40 seconds.">
      {!data ? (
        err ? <p className="sub">Cannot reach the tracker right now.</p> : <Sk w={240} h={40} className="mt-3" />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {ORDER.map((s) => (
              <div key={s} title={STATUS_HELP[s]} className="rounded-2xl bg-white/[.04] p-3.5">
                <div className="flex items-center gap-1.5 text-[12.5px] text-mute"><i className="h-2 w-2 rounded-full" style={{ background: COLOR[s] }} />{STATUS_LABEL[s]}</div>
                <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{by(s)}</div>
              </div>
            ))}
          </div>
          {data.pages.length > 0 && (
            <>
              <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim">Pages real people are on</h3>
              <Rows rows={data.pages.map((p) => ({ name: `${site(p.site)}  ${p.path}`, v: p.n }))} />
            </>
          )}
          {data.pages.length === 0 && <p className="sub mt-3">No real person is on a page this second.</p>}
        </>
      )}
    </Card>
  );
}

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
    <Card title="Visits per day" note="Green is a real person, amber did nothing, red is a known bot.">
      <div className="mt-3 flex h-36 items-end gap-[3px]" role="img" aria-label="Visits per day, split into real people, no interaction and bots">
        {days.map(([d, o]) => (
          <div key={d} title={`${d}: ${o.real} real, ${o.unclear} no interaction, ${o.bot} bots`} className="flex h-full min-w-[3px] flex-1 flex-col-reverse overflow-hidden rounded-t">
            {ORDER.map((s) => <i key={s} style={{ height: `${(100 * o[s]) / max}%`, background: COLOR[s] }} className="block w-full" />)}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-dim"><span>{days[0]![0]}</span><span>{days[days.length - 1]![0]}</span></div>
    </Card>
  );
}

function Journeys({ row, keyStr }: { row: FeedRow; keyStr: string }) {
  const params = useMemo(() => ({ sid: row.sid }), [row.sid]);
  const { data } = usePulse<Journey>("/v/journey", params, { key: keyStr });
  if (!data) return <Sk w={200} h={14} className="m-3" />;
  return (
    <ol className="m-0 list-none space-y-3 border-t border-line px-3 py-3 text-[13px]">
      {data.hits.map((h) => (
        <li key={h.id}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11.5px] text-dim">{when(h.ts)}</span>
            <b>{h.path}</b>
            <span className="text-dim">from {KIND_LABEL[h.ref_kind] ?? h.ref_kind}{h.ref_host ? ` (${h.ref_host})` : ""}</span>
            <span className="text-dim">· {secs(h.active)} active · {h.scroll}% scrolled</span>
          </div>
          <ul className="m-0 mt-1 list-none space-y-0.5 pl-4">
            {data.clicks.filter((c) => c.hid === h.id).map((c) => (
              <li key={c.n} className="text-mute">
                {c.n}. <span className="text-ink">{CLICK_LABEL[c.kind] ?? c.kind}</span>{c.label ? `: ${c.label}` : ""}{c.href ? ` to ${c.href}` : ""}
                {c.sec ? <span className="text-dim"> ({c.sec})</span> : null}
                {c.z ? <span className="ml-1 font-semibold text-bad">rapid repeated clicks</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Feed({ keyStr, siteFilter }: { keyStr: string; siteFilter: string }) {
  const [who, setWho] = useState<Status | "all">("all");
  const [open, setOpen] = useState("");
  const params = useMemo(() => ({ limit: 60, site: siteFilter === "all" ? undefined : siteFilter, who: who === "all" ? undefined : who }), [siteFilter, who]);
  const { data, err } = usePulse<FeedRow[]>("/v/feed", params, { key: keyStr, poll: 10000 });
  return (
    <Card title="Visits one by one" note="The newest first. Tap a visit to see its pages and clicks in order.">
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["all", ...ORDER] as const).map((s) => (
          <button key={s} type="button" onClick={() => setWho(s)} className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold ${who === s ? "bg-brand/15 text-brand" : "bg-white/[.05] text-mute"}`}>
            {s === "all" ? "Everyone" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {err === "key" && <p className="sub mt-3 text-bad">That key was not accepted.</p>}
      {!data && !err && <Sk w={300} h={14} className="mt-4" />}
      {data && data.length === 0 && <p className="sub mt-3">No visits like this yet.</p>}
      {data && data.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
          {data.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-xl bg-white/[.03]">
              <button type="button" onClick={() => setOpen(open === r.id ? "" : r.id)} aria-expanded={open === r.id} className="grid w-full gap-x-3 gap-y-0.5 px-3 py-2.5 text-left lg:grid-cols-[150px_1fr_auto]">
                <span className="whitespace-nowrap font-mono text-[11.5px] text-dim">{when(r.last)}</span>
                <span className="min-w-0">
                  <b className="text-[13.5px]">{site(r.site)}</b> <span className="break-all text-[13.5px] text-mute">{r.path}</span>
                  <span className="block text-[12px] text-dim">
                    from {KIND_LABEL[r.ref_kind] ?? r.ref_kind}{r.ref_host ? ` (${r.ref_host})` : ""} · {regionName(r.country)} · {r.device}, {r.browser}, {r.os}
                    {" · "}{secs(r.active)} active · {r.scroll}% scrolled · {r.nclicks} click{r.nclicks === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="lg:justify-self-end"><Badge s={r.status} /></span>
              </button>
              {open === r.id && <Journeys row={r} keyStr={keyStr} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClickMapCard({ keyStr, pages, days }: { keyStr: string; pages: Summary["pages"]; days: number }) {
  const [pick, setPick] = useState("");
  const [s, p] = pick.split("|");
  const params = useMemo(() => ({ site: s, path: p, days }), [s, p, days]);
  const { data } = usePulse<ClickMap>("/v/clickmap", params, { key: keyStr, enabled: !!pick });
  const maxY = Math.max(600, ...(data?.clicks.map((c) => c.y) ?? [0]));
  const top = useMemo(() => {
    const m = new Map<string, number>();
    data?.clicks.forEach((c) => c.kind !== "other" && m.set(`${CLICK_LABEL[c.kind] ?? c.kind}: ${c.label}`, (m.get(`${CLICK_LABEL[c.kind] ?? c.kind}: ${c.label}`) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => ({ name, v }));
  }, [data]);
  return (
    <Card title="Where people click on a page" note="Each dot is one click, placed where it landed. Red dots are rapid repeated clicks, grey dots are clicks on something that is not clickable.">
      <select aria-label="Choose a page" value={pick} onChange={(e) => setPick(e.target.value)} className="mt-3 min-h-11 w-full rounded-xl bg-white/[.05] px-3 text-[14px]">
        <option value="">Choose a page</option>
        {pages.map((x) => <option key={`${x.site}|${x.path}`} value={`${x.site}|${x.path}`}>{site(x.site)} {x.path} ({x.n} visits)</option>)}
      </select>
      {pick && !data && <Sk w={240} h={14} className="mt-4" />}
      {data && (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative overflow-hidden rounded-xl border border-line bg-white/[.02]" style={{ height: Math.min(560, Math.max(260, maxY / 3)) }} role="img" aria-label="Click positions on the page">
            {data.clicks.map((c, i) => (
              <i key={i} title={`${CLICK_LABEL[c.kind] ?? c.kind}${c.label ? `: ${c.label}` : ""}`} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
                style={{ left: `${c.x}%`, top: `${(100 * c.y) / maxY}%`, background: c.z ? "var(--bad)" : c.kind === "other" ? "var(--dim)" : "var(--brand)" }} />
            ))}
          </div>
          <div>
            <p className="m-0 text-[14px] text-mute"><b className="text-ink">{data.clicks.length}</b> clicks from <b className="text-ink">{data.visits}</b> visits{data.clicks.length >= 600 ? " (showing the latest 600)" : ""}.</p>
            <Rows rows={top} empty="No clicks on buttons or links on this page yet." />
          </div>
        </div>
      )}
    </Card>
  );
}

function Unlock({ keyStr, setKey }: { keyStr: string; setKey: (k: string) => void }) {
  const [v, setV] = useState("");
  if (keyStr) {
    return (
      <p className="sub flex flex-wrap items-center gap-2">
        Unlocked on this device.
        <button type="button" onClick={() => setKey("")} className="min-h-9 rounded-full bg-white/[.05] px-3 text-[13px] font-semibold text-mute">Lock again</button>
      </p>
    );
  }
  return (
    <Card title="Unlock the one-by-one views" note="The numbers above are totals and public. Individual visits, their journeys and click maps need your key. It is kept only in this browser.">
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) setKey(v.trim()); }}>
        <input type="password" autoComplete="off" aria-label="Key" value={v} onChange={(e) => setV(e.target.value)} placeholder="Key" className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/[.05] px-3 text-[14px]" />
        <button type="submit" className="min-h-11 rounded-xl bg-brand/15 px-5 text-[14px] font-semibold text-brand">Unlock</button>
      </form>
    </Card>
  );
}

export default function Watch() {
  const f = useFilters();
  const days = daysFor(f.range);
  const [keyStr, setKey] = useKey();
  const params = useMemo(() => ({ days, site: f.site === "all" ? undefined : f.site }), [days, f.site]);
  const { data: sum, err } = usePulse<Summary>("/v/summary", params, { poll: 60000 });

  const counts = useMemo(() => {
    const o: Record<Status, number> = { real: 0, unclear: 0, bot: 0 };
    sum?.status.forEach((r) => (o[r.status] = r.hits));
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

  return (
    <div className="space-y-4">
      <RightNow siteFilter={f.site} />

      <Card title={`The last ${days} days`} note="Our own tracker, not Google. A visit is one page view. Counting began on the day each site got the script.">
        {!sum ? (
          err ? <p className="sub">Cannot reach the tracker right now.</p> : <Sk w={260} h={44} className="mt-3" />
        ) : total === 0 ? (
          <p className="sub mt-3">No visits recorded yet for this choice. The tracker was just switched on, so numbers appear as visitors arrive.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {ORDER.map((s) => (
                <div key={s} title={STATUS_HELP[s]} className="rounded-2xl bg-white/[.04] p-3.5">
                  <div className="flex items-center gap-1.5 text-[12.5px] text-mute"><i className="h-2 w-2 rounded-full" style={{ background: COLOR[s] }} />{STATUS_LABEL[s]}</div>
                  <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{n(counts[s])}</div>
                  <div className="mt-1 text-[12.5px] text-dim">{pct(counts[s], total)}% of {n(total)} visits</div>
                </div>
              ))}
            </div>
            <p className="sub mt-3">{STATUS_LABEL.real}: {STATUS_HELP.real} They stayed {secs(real?.active)} on average and scrolled {real?.scroll ?? 0}% of the page.</p>
            {sum.signals.total ? (
              <p className="sub">Clicks by real people: {n(sum.signals.total)}. Rapid repeated clicks (a sign something did not work): {n(sum.signals.rage ?? 0)}. Clicks on something that is not clickable: {n(sum.signals.dead ?? 0)}.</p>
            ) : null}
            {silent.length > 0 && <p className="sub">Not reporting yet: {silent.map(site).join(", ")}.</p>}
          </>
        )}
      </Card>

      {sum && total > 0 && (
        <>
          <Daily rows={sum.daily} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Where real people came from">
              <Rows rows={sum.kinds.map((k) => ({ name: KIND_LABEL[k.ref_kind] ?? k.ref_kind, v: k.n }))} />
              {sum.hosts.length > 0 && (
                <>
                  <h3 className="m-0 mb-1 mt-4 text-[12.5px] font-semibold uppercase tracking-wider text-dim">The exact sites and campaigns</h3>
                  <Rows rows={sum.hosts.map((h) => ({ name: h.ref_host, v: h.n, note: KIND_LABEL[h.ref_kind] ?? h.ref_kind }))} />
                </>
              )}
            </Card>
            <Card title="Pages real people opened">
              <Rows rows={sum.pages.slice(0, 12).map((p) => ({ name: `${f.site === "all" ? site(p.site) + "  " : ""}${p.path}`, v: p.n, note: `${secs(p.active)} · ${p.scroll ?? 0}%` }))} empty="No real visits yet." />
            </Card>
            <Card title="What real people clicked" note="Buttons and links, most clicked first.">
              <Rows rows={sum.clicks.slice(0, 14).map((c) => ({ name: `${CLICK_LABEL[c.kind] ?? c.kind}: ${c.label || c.href || "(no label)"}`, v: c.n, note: c.rage ? `${c.rage} rapid` : undefined }))} empty="No clicks recorded yet." />
            </Card>
            <Card title="Sites">
              <div className="mt-2 space-y-2.5">
                {perSite.map(([h, o]) => {
                  const t = o.real + o.unclear + o.bot;
                  return (
                    <div key={h}>
                      <div className="flex items-baseline justify-between gap-3 text-[14px]"><span>{site(h)}</span><b className="font-mono text-[13px]">{n(o.real)} <span className="font-normal text-dim">real of {n(t)}</span></b></div>
                      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">{ORDER.map((s) => <i key={s} style={{ width: `${pct(o[s], t)}%`, background: COLOR[s] }} />)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Countries of real people">
              <Rows rows={sum.countries.map((c) => ({ name: regionName(c.country), v: c.n }))} empty="No real visits yet." />
            </Card>
            <Card title="Devices of real people">
              <Rows rows={sum.devices.map((d) => ({ name: `${d.device}, ${d.browser}`, v: d.n }))} empty="No real visits yet." />
            </Card>
          </div>
        </>
      )}

      <Unlock keyStr={keyStr} setKey={setKey} />
      {keyStr && (
        <>
          <Feed keyStr={keyStr} siteFilter={f.site} />
          {sum && sum.pages.length > 0 && <ClickMapCard keyStr={keyStr} pages={sum.pages} days={days} />}
        </>
      )}
    </div>
  );
}
