"use client";

import { useMemo, type ReactNode } from "react";
import { usePulse, useKey } from "@/lib/pulse";
import { useFilters } from "@/lib/filters";
import { Card, Empty, Kpi } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { cols2, grid4 } from "./kit";
import { SectionHead } from "./FormInbox";

interface EsportsFile {
  days: number;
  users: { total: number; verified: number; discord: number; last: string | null };
  inPeriod: { n: number; verified: number | null };
  daily: { day: string; n: number }[];
  counts: { orgs: number; teams: number; events: number; tournaments: number; registrations: number; players: number };
  feedback: { id: string; created_at: number; kind: string; message: string; page_path: string; signed_in: number; contact: string; status: string }[];
  contacts: { id: string; created_at: string; name: string; email: string; message: string }[];
}
const DAYS: Record<string, number> = { "7d": 7, "28d": 28, "3m": 90, "6m": 182, "12m": 365, "16m": 486 };
const note = (t: ReactNode) => <p className="mt-1 text-[12px] leading-snug text-dim">{t}</p>;
const when = (d: Date) => d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/**
 * Esports Hub: sign-ups and what people send from inside the app, read from the app's own database. Same key as the
 * form inbox (which shows the unlock box). Counts and feedback text only; no passwords, no sign-up email addresses.
 */
export function EsportsCard() {
  const f = useFilters();
  const [keyStr] = useKey();
  const params = useMemo(() => ({ days: DAYS[f.range] ?? 90 }), [f.range]);
  const { data, err } = usePulse<EsportsFile>("/v/esports", params, { key: keyStr, enabled: !!keyStr, poll: 120000 });
  if (!keyStr || err === "key") return null;
  const u = data?.users;
  const items = [
    ...(data?.feedback ?? []).map((x) => ({ id: x.id, at: new Date(x.created_at * 1000), tag: x.kind || "feedback", where: `${x.page_path}${x.signed_in ? " · signed in" : ""}`, text: x.message, contact: x.contact, email: "" })),
    ...(data?.contacts ?? []).map((x) => ({ id: x.id, at: new Date(x.created_at), tag: "contact", where: x.name, text: x.message, contact: "", email: x.email })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <SectionHead title="Esports Hub" sub="Sign-ups and feedback from inside the app, read from its own database." />
      <div className={grid4}>
        <Kpi id="es-signups" title="Sign-ups" value={u ? String(u.total) : "–"} note={note(data ? `${data.inPeriod.n} in the last ${data.days} days` : "loading")} />
        <Kpi id="es-verified" title="Confirmed their email" value={u ? String(u.verified) : "–"} note={note(u && u.total ? `${Math.round((100 * u.verified) / u.total)}% of sign-ups` : "")} />
        <Kpi id="es-orgs" title="Organisations" value={data ? String(data.counts.orgs) : "–"} note={note(data ? `${data.counts.teams} team${data.counts.teams === 1 ? "" : "s"} · ${data.counts.events} event${data.counts.events === 1 ? "" : "s"}` : "")} />
        <Kpi id="es-tourn" title="Tournaments" value={data ? String(data.counts.tournaments) : "–"} note={note(data ? `${data.counts.registrations} registrations` : "")} />
      </div>
      <div className={cols2}>
        <DataTable
          title="Sign-ups per day"
          note={u ? `Latest: ${u.last ? when(new Date(u.last)) : "none yet"}. ${u.discord} linked Discord.` : undefined}
          cols={["Day", "Sign-ups"]}
          fmt={[0, "n"]}
          bar={1}
          sort={0}
          max={10}
          empty={err ? "Could not reach the esports numbers. It will retry." : "No sign-ups in this period."}
          rows={(data?.daily ?? []).map((d) => [d.day, d.n])}
        />
        <Card title="Feedback from the app" note="The report button inside Esports Hub saves here, never to email.">
          {items.length ? (
            <ul className="mt-2 divide-y divide-white/[.06]">
              {items.map((x) => (
                <li key={x.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-brand">{x.tag}</span>
                    <span className="truncate text-[12.5px] text-mute">{x.where}</span>
                    <span className="ml-auto flex-none text-[12px] text-dim">{when(x.at)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{x.text}</p>
                  <p className="mt-1 text-[12.5px] text-dim">
                    {x.email ? <a className="text-brand underline" href={`mailto:${x.email}`}>{x.email}</a> : x.contact ? `Contact: ${x.contact}` : "No contact left, so it cannot be answered."}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty msg={data ? "No feedback in this period." : "Loading…"} />
          )}
        </Card>
      </div>
    </>
  );
}
