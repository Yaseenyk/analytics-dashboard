"use client";

import { useEffect, useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import {
  STATUS_HELP, STATUS_LABEL, STATUS_ONE, daysFor, regionName, useKey, usePulse,
  type ClickMap, type FeedRow, type Journey, type Live, type Status, type Summary,
} from "@/lib/pulse";
import { Card, Sk } from "@/components/ui";
import { DataTable } from "@/components/DataTable";

const COLOR: Record<Status, string> = { real: "var(--good)", unclear: "var(--s3)", bot: "var(--bad)" };
const ORDER: Status[] = ["real", "unclear", "bot"];
const KIND_LABEL: Record<string, string> = { search: "Search engines", social: "Social and messaging", ai: "AI assistants", direct: "Direct or unknown", own: "Your other sites", internal: "Same site", email: "Email", paid: "Paid", other: "Other websites" };
const CLICK_LABEL: Record<string, string> = { link: "Link", out: "Leaves the site", btn: "Button", tab: "Tab", input: "Form field", mail: "Email link", tel: "Phone link", dl: "Download", other: "Not clickable" };
const site = (h: string) => SITES[h] ?? h;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const secs = (s: number | null | undefined) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const when = (ms: number) => {
  const d = new Date(ms);
  return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const offset = (t: number, t0: number) => { const d = Math.max(0, Math.round((t - t0) / 1000)); return d < 60 ? `+${d}s` : `+${Math.floor(d / 60)}m ${d % 60}s`; };

/** One click in plain words, with how much it matters: strong (a goal), normal, or weak (nothing happened). */
function say(c: { kind: string; label: string; href: string }): { icon: string; text: string; tone: "strong" | "normal" | "weak" } {
  const l = c.label ? `“${c.label}”` : "";
  switch (c.kind) {
    case "dl": return { icon: "⬇", text: `Downloaded ${c.href || c.label || "a file"}`, tone: "strong" };
    case "out": return { icon: "↗", text: `Went to another website: ${c.href || c.label}`, tone: "strong" };
    case "mail": return { icon: "✉", text: `Tapped an email link ${l}`.trim(), tone: "strong" };
    case "tel": return { icon: "☎", text: `Tapped a phone link ${l}`.trim(), tone: "strong" };
    case "link": return { icon: "→", text: `Opened ${c.href || "a page"}${l ? ` from the link ${l}` : ""}`, tone: "normal" };
    case "btn": return { icon: "●", text: `Pressed the button ${l || "(no label)"}`, tone: "normal" };
    case "tab": return { icon: "●", text: `Switched to the tab ${l}`, tone: "normal" };
    case "input": return { icon: "✎", text: `Used the form field ${l || ""}`.trim(), tone: "normal" };
    default: return { icon: "○", text: "Tapped something that is not clickable", tone: "weak" };
  }
}

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
          <div className="flex items-start justify-between gap-3 text-[14px]">
            <span className="min-w-0 break-words">{r.name}{r.note && <span className="block text-[12px] font-normal text-dim sm:hidden">{r.note}</span>}</span>
            <b className="shrink-0 font-mono text-[13px]">{n(r.v)}{r.note && <span className="ml-2 hidden font-normal text-dim sm:inline">{r.note}</span>}</b>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><i className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (100 * r.v) / max)}%` }} /></div>
        </li>
      ))}
    </ul>
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
    <div className="border-t border-line px-3 py-3">
      <p className="m-0 mb-3 text-[12.5px] text-dim">This visitor’s steps in this browser tab, in order. {data.hits.length} page{data.hits.length === 1 ? "" : "s"}.</p>
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

function Feed({ keyStr, siteFilter }: { keyStr: string; siteFilter: string }) {
  const [who, setWho] = useState<Status | "all">("all");
  const [onlyAct, setOnlyAct] = useState(false);
  const [open, setOpen] = useState("");
  const params = useMemo(() => ({ limit: 60, site: siteFilter === "all" ? undefined : siteFilter, who: who === "all" ? undefined : who }), [siteFilter, who]);
  const { data, err } = usePulse<FeedRow[]>("/v/feed", params, { key: keyStr, poll: 10000 });
  const rows = data && onlyAct ? data.filter((r) => (r.ndl ?? 0) + (r.nout ?? 0) > 0) : data;
  const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold ${on ? "bg-brand/15 text-brand" : "bg-white/[.05] text-mute"}`;
  return (
    <Card title="Visits one by one" note="Newest first. Tap a visit to see what that person did, step by step.">
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter visits">
        {(["all", ...ORDER] as const).map((s) => (
          <button key={s} type="button" aria-pressed={who === s} onClick={() => setWho(s)} className={chip(who === s)}>
            {s === "all" ? "Everyone" : STATUS_LABEL[s]}
          </button>
        ))}
        <button type="button" aria-pressed={onlyAct} onClick={() => setOnlyAct(!onlyAct)} className={chip(onlyAct)}>Downloads and exits only</button>
      </div>
      {err === "key" && <p className="sub mt-3 text-bad">That key was not accepted.</p>}
      {!data && !err && <Sk w={300} h={14} className="mt-4" />}
      {rows && rows.length === 0 && <p className="sub mt-3">No visits like this yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-2 p-0">
          {rows.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-xl bg-white/[.03]">
              <button type="button" onClick={() => setOpen(open === r.id ? "" : r.id)} aria-expanded={open === r.id} className="block w-full px-3 py-3 text-left">
                <span className="flex items-center justify-between gap-2">
                  <Badge s={r.status} />
                  <span className="text-[12px] text-dim" title={when(r.last)}>{ago(r.last)}</span>
                </span>
                <span className="mt-2 block text-[14px] leading-snug"><b>{site(r.site)}</b> <span className="break-all text-mute">{r.path}</span></span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-dim">
                  From {KIND_LABEL[r.ref_kind] ?? r.ref_kind}{r.ref_host ? ` (${r.ref_host})` : ""} · {regionName(r.country)} · {r.device}, {r.browser}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                  <span className="rounded-md bg-white/[.05] px-2 py-0.5 text-mute">{secs(r.active)} active</span>
                  <span className="rounded-md bg-white/[.05] px-2 py-0.5 text-mute">{r.scroll}% scrolled</span>
                  <span className="rounded-md bg-white/[.05] px-2 py-0.5 text-mute">{r.nclicks} click{r.nclicks === 1 ? "" : "s"}</span>
                  {r.ndl > 0 && <span className="rounded-md bg-brand/15 px-2 py-0.5 font-semibold text-brand">⬇ {r.ndl} download{r.ndl === 1 ? "" : "s"}</span>}
                  {r.nout > 0 && <span className="rounded-md bg-brand/15 px-2 py-0.5 font-semibold text-brand">↗ {r.nout} exit{r.nout === 1 ? "" : "s"} or contact</span>}
                </span>
                <span className="mt-2 block text-[12px] font-semibold text-brand">{open === r.id ? "Hide steps ▲" : "Show steps ▼"}</span>
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
        Private views are unlocked on this phone.
        <button type="button" onClick={() => setKey("")} className="min-h-9 rounded-full bg-white/[.05] px-3 text-[13px] font-semibold text-mute">Lock again</button>
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

const tile = (label: string, value: string, sub: string, color: string) => (
  <div key={label} className="card !p-3.5">
    <div className="flex items-center gap-1.5 text-[12.5px] text-mute"><i className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
    <div className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight">{value}</div>
    <div className="mt-1.5 text-[11.5px] leading-snug text-dim">{sub}</div>
  </div>
);

export default function Watch() {
  const f = useFilters();
  const days = daysFor(f.range);
  const [keyStr, setKey] = useKey();
  const params = useMemo(() => ({ days, site: f.site === "all" ? undefined : f.site }), [days, f.site]);
  const { data: sum, err } = usePulse<Summary>("/v/summary", params, { poll: 60000 });
  const liveParams = useMemo(() => ({ site: f.site === "all" ? undefined : f.site }), [f.site]);
  const { data: live } = usePulse<Live>("/v/live", liveParams, { poll: 10000 });

  // a link like /watch/?key=... unlocks this phone once, then the key is removed from the address bar
  useEffect(() => {
    try {
      const u = new URL(location.href);
      const k = u.searchParams.get("key");
      if (k) { setKey(k); u.searchParams.delete("key"); history.replaceState(null, "", u.pathname + u.search); }
    } catch { /* ignore */ }
  }, [setKey]);

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
  const liveReal = live?.status.find((x) => x.status === "real")?.n ?? 0;
  const all = f.site === "all";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {sum ? (
          <>
            {tile("Real people", n(counts.real), total ? `${pct(counts.real, total)}% of ${n(total)} visits` : "No visits yet", COLOR.real)}
            {tile("Did nothing", n(counts.unclear), total ? `${pct(counts.unclear, total)}% opened and left` : "", COLOR.unclear)}
            {tile("Bots", n(counts.bot), total ? `${pct(counts.bot, total)}% robots, not people` : "", COLOR.bot)}
            {tile("Online now", n(liveReal), "real people on a page this minute", COLOR.real)}
          </>
        ) : err ? (
          <p className="sub col-span-2">Cannot reach the tracker right now.</p>
        ) : (
          <><Sk w="100%" h={84} /><Sk w="100%" h={84} /><Sk w="100%" h={84} /><Sk w="100%" h={84} /></>
        )}
      </div>
      <p className="sub !mt-0 px-1">Our own tracker, not Google. One visit is one page opened. “Real” means the person touched, scrolled or typed on the page. Last {days} days.{sum && real ? ` A real visitor stays ${secs(real.active)} and reads ${real.scroll ?? 0}% of the page.` : ""}</p>

      {sum && total === 0 && <Card title="No visits yet"><p className="sub mt-2">The tracker was just switched on, so numbers appear as visitors arrive.</p></Card>}

      {sum && total > 0 && (
        <>
          <Daily rows={sum.daily} />
          <DataTable
            title="Downloads, exits and contacts"
            note="A file downloaded, a link to another website, an email or phone tap. Real people only."
            cols={["What happened", "Times", "Where", "When"]}
            fmt={[0, "n", 0, 0]}
            bar={1}
            max={10}
            empty="None yet. Download tracking started on 17 Nov 2026, so earlier ones were not recorded."
            rows={(sum.actions ?? []).map((a) => [say(a).text, a.n, `${all ? site(a.site) + " " : ""}${a.path}`, ago(a.last)])}
          />
          <DataTable
            title="Pages real people opened"
            cols={["Page", "Visits", "Time on page", "Read"]}
            fmt={[0, "n", "dur", "p"]}
            bar={1}
            max={10}
            rows={sum.pages.map((p) => [`${all ? site(p.site) + " " : ""}${p.path}`, p.n, p.active ?? 0, p.scroll ?? 0])}
          />
          <DataTable
            title="What real people tapped"
            note="Buttons and links, most tapped first."
            cols={["What", "Taps", "Quick repeats"]}
            fmt={[0, "n", "n"]}
            bar={1}
            max={10}
            empty="No taps on buttons or links yet."
            rows={sum.clicks.map((c) => [`${CLICK_LABEL[c.kind] ?? c.kind}: ${c.label || c.href || "(no label)"}`, c.n, c.rage ?? 0])}
          />
          <DataTable
            title="Where real people came from"
            cols={["Source", "Visits"]}
            fmt={[0, "n"]}
            bar={1}
            max={10}
            rows={[...sum.hosts.map((h) => [`${h.ref_host} (${KIND_LABEL[h.ref_kind] ?? h.ref_kind})`, h.n] as [string, number]), ...sum.kinds.filter((k) => !sum.hosts.some((h) => h.ref_kind === k.ref_kind)).map((k) => [KIND_LABEL[k.ref_kind] ?? k.ref_kind, k.n] as [string, number])]}
          />
          <DataTable title="Countries" cols={["Country", "Visits"]} fmt={[0, "n"]} bar={1} max={10} rows={sum.countries.map((c) => [regionName(c.country), c.n])} />
          <DataTable title="Devices" cols={["Device", "Visits"]} fmt={[0, "n"]} bar={1} max={10} rows={sum.devices.map((d) => [`${d.device}, ${d.browser}`, d.n])} />
          <DataTable
            title="Your sites"
            note={silent.length ? `Not reporting yet: ${silent.map(site).join(", ")}.` : undefined}
            cols={["Site", "Real", "Did nothing", "Bots"]}
            fmt={[0, "n", "n", "n"]}
            bar={1}
            max={12}
            rows={perSite.map(([h, o]) => [site(h), o.real, o.unclear, o.bot])}
          />
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
