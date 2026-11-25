"use client";

import { useMemo, useState, type ReactNode } from "react";
import { type Lead, type LeadStatus, type LeadsFile, pulsePost, usePulse, useKey } from "@/lib/pulse";
import { useFilters } from "@/lib/filters";
import { Card, Empty, Kpi } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { cols2, grid4 } from "./kit";
import { KIND_LABEL, ago, site } from "./watchkit";

const STATUS: { id: LeadStatus; label: string; dot: string }[] = [
  { id: "new", label: "New", dot: "bg-brand" },
  { id: "replied", label: "Replied", dot: "bg-purple" },
  { id: "won", label: "Won", dot: "bg-good" },
  { id: "lost", label: "Lost", dot: "bg-dim" },
  { id: "spam", label: "Spam", dot: "bg-bad" },
];
const statusOf = (s: LeadStatus) => STATUS.find((x) => x.id === s) ?? STATUS[0]!;
const src = (kind: string, host: string) => (host ? `${host} · ${KIND_LABEL[kind] ?? kind}` : KIND_LABEL[kind] ?? (kind || "Unknown"));
const DAYS: Record<string, number> = { "7d": 7, "28d": 28, "3m": 90, "6m": 182, "12m": 365, "16m": 486 };
const btn = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13.5px] font-semibold transition-colors";
const note = (t: ReactNode) => <p className="mt-1 text-[12px] leading-snug text-dim">{t}</p>;

/** A section title between blocks of cards, so the private inbox reads apart from the Google Analytics numbers below. */
export function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
      {sub && <p className="text-[13px] text-mute">{sub}</p>}
    </div>
  );
}

function Locked({ setKey, wrong }: { setKey: (k: string) => void; wrong: boolean }) {
  const [v, setV] = useState("");
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand/15 text-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Form inbox and sign-ups</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-mute">Every form sent on your sites, and Esports Hub sign-ups. Private, because it holds names and emails: enter your key once on this device.</p>
        </div>
      </div>
      {wrong && <p className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">That key did not work. Check it and try again.</p>}
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (v.trim()) setKey(v.trim()); }}>
        <input type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="Your key" aria-label="Key" className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/[.05] px-3 text-[14px] outline-none ring-brand/40 focus:ring-2" />
        <button type="submit" className={`${btn} min-h-11 bg-brand/15 text-brand hover:bg-brand/25`}>Unlock</button>
      </form>
    </Card>
  );
}

function Detail({ l, keyStr, onChange }: { l: Lead; keyStr: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(l.note);
  const save = async (body: { status?: LeadStatus; note?: string }) => {
    setBusy(true);
    await pulsePost("/v/leads/update", { id: l.id, ...body }, keyStr);
    setBusy(false);
    onChange();
  };
  const wa = l.phone.replace(/[^\d]/g, "");
  const facts: [string, ReactNode][] = [
    ...Object.entries(l.extra || {}).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v] as [string, ReactNode]),
    ["Sent from", `${site(l.site)} ${l.path || "/"}`],
    ["Came from", src(l.ref_kind, l.ref_host) + (l.landing ? `, landed on ${l.landing}` : "") + (l.utm_campaign ? `, campaign ${l.utm_campaign}` : "")],
    ...(l.country ? [["Country", l.country] as [string, ReactNode]] : []),
    ["Received", new Date(l.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })],
  ];
  return (
    <div className="space-y-4 px-1 pb-4 pt-1">
      {l.message ? <p className="whitespace-pre-wrap rounded-xl bg-white/[.04] p-3.5 text-[14px] leading-relaxed text-ink">{l.message}</p> : <p className="text-[13px] text-dim">No message, only contact details.</p>}
      <div className="flex flex-wrap gap-2">
        {l.email && <a className={`${btn} bg-brand/15 text-brand hover:bg-brand/25`} href={`mailto:${l.email}?subject=${encodeURIComponent("Re: your message")}`}>Reply by email</a>}
        {wa.length >= 10 && <a className={`${btn} bg-good/15 text-good hover:bg-good/25`} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {l.phone && <a className={`${btn} bg-white/[.06] text-ink hover:bg-white/[.1]`} href={`tel:${l.phone.replace(/\s/g, "")}`}>Call</a>}
      </div>
      {(l.email || l.phone) && (
        <p className="text-[13px] text-mute">{[l.email, l.phone].filter(Boolean).join(" · ")}</p>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[140px_1fr]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-dim">{k}</dt>
            <dd className="-mt-1.5 text-ink sm:mt-0">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-dim">Status</p>
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-white/[.04] p-1">
          {STATUS.map((x) => (
            <button key={x.id} type="button" disabled={busy || x.id === l.status} onClick={() => save({ status: x.id })} aria-pressed={x.id === l.status}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold ${x.id === l.status ? "bg-card2 text-ink shadow-inset" : "text-mute hover:text-ink"}`}>
              <span className={`h-2 w-2 rounded-full ${x.dot}`} aria-hidden="true" />{x.label}
            </button>
          ))}
        </div>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); save({ note: text }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Private note: what you replied, next step" aria-label="Private note" className="min-h-10 min-w-0 flex-1 rounded-xl bg-white/[.05] px-3 text-[13.5px] outline-none ring-brand/40 focus:ring-2" />
        <button type="submit" disabled={busy || text === l.note} className={`${btn} bg-white/[.06] text-ink disabled:opacity-40`}>Save note</button>
      </form>
    </div>
  );
}

function Item({ l, keyStr, open, onToggle, onChange, all }: { l: Lead; keyStr: string; open: boolean; onToggle: () => void; onChange: () => void; all: boolean }) {
  const st = statusOf(l.status);
  const who = l.name || l.email || l.phone || "No name given";
  const preview = l.message || Object.values(l.extra || {}).join(" · ") || l.email || l.phone;
  return (
    <li className={`rounded-xl transition-colors ${open ? "bg-white/[.03]" : "hover:bg-white/[.02]"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-1 py-3 text-left">
        <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${st.dot}`} title={st.label} aria-label={st.label} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-[14.5px] ${l.status === "new" ? "font-semibold text-ink" : "font-medium text-ink/90"}`}>{who}</span>
            <span className="ml-auto flex-none text-[12px] text-dim">{ago(l.ts)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-mute">{all ? `${site(l.site)} · ` : ""}{l.form}{l.note ? " · has a note" : ""}</span>
          {!open && preview && <span className="mt-1 block truncate text-[13px] text-dim">{preview}</span>}
        </span>
      </button>
      {open && <Detail l={l} keyStr={keyStr} onChange={onChange} />}
    </li>
  );
}

/**
 * Form inbox: every form sent on the sites, saved by the tracker's Worker so nothing depends on email delivery.
 * A compact list (newest first, unread in bold) that opens into the message, reply buttons, where the person came
 * from, a status and a private note. Needs the key.
 */
export function FormInbox() {
  const f = useFilters();
  const [keyStr, setKey] = useKey();
  const [bump, setBump] = useState(0);
  const [show, setShow] = useState<LeadStatus | "open">("open");
  const [openId, setOpenId] = useState("");
  const params = useMemo(() => ({ days: DAYS[f.range] ?? 365, site: f.site === "all" ? "" : f.site, b: bump }), [f.range, f.site, bump]);
  const { data, err } = usePulse<LeadsFile>("/v/leads", params, { key: keyStr, enabled: !!keyStr, poll: 60000 });

  if (!keyStr || err === "key") return <Locked setKey={setKey} wrong={err === "key"} />;
  const count = (s: LeadStatus) => data?.byStatus.find((x) => x.status === s)?.n ?? 0;
  const total = (data?.byStatus ?? []).reduce((a, x) => a + (x.status === "spam" ? 0 : x.n), 0);
  const rows = !data ? [] : show === "open" ? data.rows.filter((r) => r.status === "new" || r.status === "replied") : data.rows.filter((r) => r.status === show);
  const all = f.site === "all";
  const tabs: { id: LeadStatus | "open"; label: string; n: number }[] = [
    { id: "open", label: "Open", n: count("new") + count("replied") },
    ...STATUS.map((x) => ({ id: x.id, label: x.label, n: count(x.id) })),
  ];

  return (
    <>
      <SectionHead title="Form inbox" sub="Every form sent on your sites. Saved by your own tracker, so nothing depends on email." />
      <div className={grid4}>
        <Kpi id="leads-total" title="Forms received" value={data ? String(total) : "–"} note={note(data ? `last ${data.days} days, spam left out` : "loading")} />
        <Kpi id="leads-new" title="Waiting for a reply" value={data ? String(count("new")) : "–"} note={note(count("new") ? "answer these first" : "all answered")} />
        <Kpi id="leads-replied" title="Replied" value={data ? String(count("replied")) : "–"} />
        <Kpi id="leads-won" title="Won" value={data ? String(count("won")) : "–"} note={note(total ? `${Math.round((100 * count("won")) / total)}% of forms` : "no forms yet")} />
      </div>
      <Card>
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filter forms">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={show === t.id} onClick={() => { setShow(t.id); setOpenId(""); }}
              className={`inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${show === t.id ? "bg-brand/15 text-brand" : "bg-white/[.04] text-mute hover:text-ink"}`}>
              {t.label}<span className={`tabular-nums ${show === t.id ? "text-brand/80" : "text-dim"}`}>{t.n}</span>
            </button>
          ))}
        </div>
        {!data ? (
          <div className="mt-3 space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[.03]" />)}</div>
        ) : rows.length ? (
          <ul className="mt-2 divide-y divide-white/[.06]">
            {rows.map((l) => <Item key={l.id} l={l} keyStr={keyStr} all={all} open={openId === l.id} onToggle={() => setOpenId(openId === l.id ? "" : l.id)} onChange={() => setBump((b) => b + 1)} />)}
          </ul>
        ) : (
          <Empty msg={show === "open" ? "Nothing waiting. New forms appear here as soon as someone sends one." : `No forms marked ${statusOf(show as LeadStatus).label.toLowerCase()} in this period.`} />
        )}
        {err && data && <p className="mt-2 text-[12px] text-dim">Could not refresh just now; showing the last copy.</p>}
      </Card>
      {data && total > 0 && (
        <div className={cols2}>
          <DataTable title="Where the people who wrote came from" note="The first page of the same visit. Shows which channels bring enquiries, not just visits." cols={["Source", "Forms", "Won"]} fmt={[0, "n", "n"]} bar={1} max={8} rows={data.bySource.map((x) => [x.ref_host || (KIND_LABEL[x.ref_kind] ?? (x.ref_kind || "Unknown")), x.n, x.won])} />
          <DataTable title="Forms by site" cols={["Site", "Forms", "Won"]} fmt={[0, "n", "n"]} bar={1} max={8} rows={data.bySite.map((x) => [site(x.site), x.n, x.won])} />
          <DataTable title="Which form" cols={["Form", "Sent"]} fmt={[0, "n"]} bar={1} max={8} rows={data.byForm.map((x) => [`${all ? site(x.site) + ": " : ""}${x.form}`, x.n])} />
        </div>
      )}
    </>
  );
}
