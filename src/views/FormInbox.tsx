"use client";

import { Fragment, useMemo, useState } from "react";
import { type Lead, type LeadStatus, type LeadsFile, pulsePost, usePulse, useKey } from "@/lib/pulse";
import { useFilters } from "@/lib/filters";
import { Card, Kpi } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { KIND_LABEL, ago, site } from "./watchkit";

const STATUS: { id: LeadStatus; label: string; tone: string }[] = [
  { id: "new", label: "New", tone: "text-cyan" },
  { id: "replied", label: "Replied", tone: "text-ink" },
  { id: "won", label: "Won", tone: "text-emerald-400" },
  { id: "lost", label: "Lost", tone: "text-mute" },
  { id: "spam", label: "Spam", tone: "text-dim" },
];
const src = (kind: string, host: string) => (host ? `${host} (${KIND_LABEL[kind] ?? kind})` : KIND_LABEL[kind] ?? (kind || "unknown"));
const DAYS: Record<string, number> = { "7d": 7, "28d": 28, "3m": 90, "6m": 182, "12m": 365, "16m": 486 };

function KeyForm({ setKey, wrong }: { setKey: (k: string) => void; wrong: boolean }) {
  const [v, setV] = useState("");
  return (
    <Card title="Form inbox" note="Every form people send on your sites is saved here, so nothing depends on email arriving. It holds names, emails and messages, so it opens with the same key as the visitor list.">
      {wrong && <p className="mt-2 text-[13px] text-red-400">That key did not work.</p>}
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) setKey(v.trim()); }}>
        <input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="Key" aria-label="Key" className="min-h-10 flex-1 rounded-xl border border-white/10 bg-card2 px-3 text-[14px]" />
        <button type="submit" className="min-h-10 rounded-xl bg-cyan px-4 text-[14px] font-semibold text-black">Open inbox</button>
      </form>
    </Card>
  );
}

function Row({ l, keyStr, onChange, all }: { l: Lead; keyStr: string; onChange: () => void; all: boolean }) {
  const [open, setOpen] = useState(l.status === "new");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(l.note);
  const set = async (body: { status?: LeadStatus; note?: string }) => {
    setBusy(true);
    await pulsePost("/v/leads/update", { id: l.id, ...body }, keyStr);
    setBusy(false);
    onChange();
  };
  const st = STATUS.find((x) => x.id === l.status) ?? STATUS[0]!;
  const extra = Object.entries(l.extra || {});
  const wa = l.phone.replace(/[^\d]/g, "");
  return (
    <li className="border-t border-white/10 py-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
        <span className={`text-[12px] font-semibold uppercase tracking-wide ${st.tone}`}>{st.label}</span>
        <span className="text-[15px] font-semibold text-ink">{l.name || l.email || l.phone || "No name"}</span>
        <span className="text-[13px] text-mute">{all ? `${site(l.site)} · ` : ""}{l.form}</span>
        <span className="ml-auto text-[12.5px] text-dim">{ago(l.ts)}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[14px]">
          {l.message && <p className="whitespace-pre-wrap rounded-xl bg-card2 p-3 text-ink">{l.message}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            {l.email && <><dt className="text-dim">Email</dt><dd><a className="text-cyan underline" href={`mailto:${l.email}`}>{l.email}</a></dd></>}
            {l.phone && <><dt className="text-dim">Phone</dt><dd>{l.phone}{wa.length >= 10 && <> · <a className="text-cyan underline" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</dd></>}
            {extra.map(([k, v]) => <Fragment key={k}><dt className="text-dim">{k}</dt><dd>{v}</dd></Fragment>)}
            <dt className="text-dim">Sent from</dt><dd>{site(l.site)}{l.path}</dd>
            <dt className="text-dim">Came from</dt><dd>{src(l.ref_kind, l.ref_host)}{l.landing ? `, landed on ${l.landing}` : ""}{l.utm_campaign ? `, campaign ${l.utm_campaign}` : ""}</dd>
            {l.country && <><dt className="text-dim">Country</dt><dd>{l.country}</dd></>}
            <dt className="text-dim">Received</dt><dd>{new Date(l.ts).toLocaleString("en-IN")}</dd>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {STATUS.map((x) => (
              <button key={x.id} type="button" disabled={busy || x.id === l.status} onClick={() => set({ status: x.id })}
                className={`min-h-9 rounded-full px-3 text-[13px] font-semibold ${x.id === l.status ? "bg-cyan text-black" : "bg-white/[.06] text-mute"}`}>{x.label}</button>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ note }); }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note (what you replied, next step)" aria-label="Note" className="min-h-9 flex-1 rounded-xl border border-white/10 bg-card2 px-3 text-[13px]" />
            <button type="submit" disabled={busy || note === l.note} className="min-h-9 rounded-xl bg-white/[.08] px-3 text-[13px] font-semibold">Save note</button>
          </form>
        </div>
      )}
    </li>
  );
}

/**
 * Form inbox: every form sent on the sites, saved by the tracker's Worker so nothing depends on email delivery.
 * Shows the message, how to reply, where the person came from, and a status to work through. Needs the key.
 */
export function FormInbox() {
  const f = useFilters();
  const [keyStr, setKey] = useKey();
  const [bump, setBump] = useState(0);
  const [show, setShow] = useState<LeadStatus | "all">("all");
  const params = useMemo(() => ({ days: DAYS[f.range] ?? 365, site: f.site === "all" ? "" : f.site, b: bump }), [f.range, f.site, bump]);
  const { data, err } = usePulse<LeadsFile>("/v/leads", params, { key: keyStr, enabled: !!keyStr, poll: 60000 });
  if (!keyStr || err === "key") return <KeyForm setKey={setKey} wrong={err === "key"} />;
  if (!data) return <Card title="Form inbox"><p className="sub mt-2">{err ? "Could not reach the inbox. It will retry." : "Loading…"}</p></Card>;
  const count = (s: LeadStatus) => data.byStatus.find((x) => x.status === s)?.n ?? 0;
  const total = data.byStatus.reduce((a, x) => a + (x.status === "spam" ? 0 : x.n), 0);
  const rows = show === "all" ? data.rows.filter((r) => r.status !== "spam") : data.rows.filter((r) => r.status === show);
  const all = f.site === "all";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi id="leads-total" title="Forms received" value={total} note={`last ${data.days} days, spam left out`} />
        <Kpi id="leads-new" title="Waiting for a reply" value={count("new")} />
        <Kpi id="leads-won" title="Won" value={count("won")} note={total ? `${Math.round((100 * count("won")) / total)}% of forms` : undefined} />
        <Kpi id="leads-replied" title="Replied" value={count("replied")} />
      </div>
      <Card title="Form inbox" note="Every form sent on your sites, newest first. Saved by your own tracker, so nothing depends on email. Mark each one as you deal with it." extra={
        <div className="flex flex-wrap gap-1">
          {(["all", ...STATUS.map((x) => x.id)] as const).map((x) => (
            <button key={x} type="button" onClick={() => setShow(x)} className={`min-h-8 rounded-full px-2.5 text-[12.5px] font-semibold ${show === x ? "bg-cyan text-black" : "bg-white/[.05] text-mute"}`}>{x === "all" ? "Open" : STATUS.find((s) => s.id === x)!.label}</button>
          ))}
        </div>
      }>
        {rows.length ? (
          <ul className="mt-2">{rows.map((l) => <Row key={l.id} l={l} keyStr={keyStr} all={all} onChange={() => setBump((b) => b + 1)} />)}</ul>
        ) : (
          <p className="sub mt-2">No forms here yet. They arrive here as each site&apos;s forms are switched over to the inbox.</p>
        )}
      </Card>
      <DataTable title="Forms by site" cols={["Site", "Forms", "Won"]} fmt={[0, "n", "n"]} bar={1} max={13} empty="No forms yet." rows={data.bySite.map((x) => [site(x.site), x.n, x.won])} />
      <DataTable title="Where the people who wrote came from" note="The first page of the same visit: search, ChatGPT, LinkedIn, direct. Shows which channels bring enquiries, not just visits." cols={["Source", "Forms", "Won"]} fmt={[0, "n", "n"]} bar={1} max={10} empty="No forms yet." rows={data.bySource.map((x) => [src(x.ref_kind, x.ref_host), x.n, x.won])} />
      <DataTable title="Which form" cols={["Form", "Sent"]} fmt={[0, "n"]} bar={1} max={12} empty="No forms yet." rows={data.byForm.map((x) => [`${all ? site(x.site) + ": " : ""}${x.form}`, x.n])} />
    </>
  );
}
