"use client";

import { useMemo } from "react";
import { usePulse, useKey } from "@/lib/pulse";
import { useFilters } from "@/lib/filters";
import { Card, Kpi } from "@/components/ui";
import { DataTable } from "@/components/DataTable";

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

/**
 * Esports Hub: sign-ups and what people send from inside the app, read from the app's own database. Same key as the
 * form inbox. Shows counts and feedback text only; no passwords, no sign-up email addresses.
 */
export function EsportsCard() {
  const f = useFilters();
  const [keyStr] = useKey();
  const params = useMemo(() => ({ days: DAYS[f.range] ?? 90 }), [f.range]);
  const { data, err } = usePulse<EsportsFile>("/v/esports", params, { key: keyStr, enabled: !!keyStr, poll: 120000 });
  if (!keyStr || err === "key") return null; // the inbox above asks for the key
  if (!data) return <Card title="Esports Hub sign-ups"><p className="sub mt-2">{err ? "Could not reach the esports numbers. It will retry." : "Loading…"}</p></Card>;
  const u = data.users;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi id="es-signups" title="Esports sign-ups" value={u.total} note={`${data.inPeriod.n} in the last ${data.days} days`} />
        <Kpi id="es-verified" title="Confirmed their email" value={u.verified} note={u.total ? `${Math.round((100 * u.verified) / u.total)}% of sign-ups` : undefined} />
        <Kpi id="es-orgs" title="Organisations" value={data.counts.orgs} note={`${data.counts.teams} teams, ${data.counts.events} events`} />
        <Kpi id="es-tourn" title="Tournaments" value={data.counts.tournaments} note={`${data.counts.registrations} registrations`} />
      </div>
      <DataTable
        title="Esports sign-ups per day"
        note={`New accounts on esports.streamerosai.com. Latest: ${u.last ? new Date(u.last).toLocaleString("en-IN") : "none yet"}. ${u.discord} linked Discord.`}
        cols={["Day", "Sign-ups"]}
        fmt={[0, "n"]}
        bar={1}
        max={14}
        empty="No sign-ups in this period."
        rows={[...data.daily].reverse().map((d) => [d.day, d.n])}
      />
      <Card title="Feedback sent from the esports app" note="The report button inside Esports Hub saves here, not to email. Newest first.">
        {data.feedback.length || data.contacts.length ? (
          <ul className="mt-2">
            {data.feedback.map((x) => (
              <li key={x.id} className="border-t border-white/10 py-3 text-[14px]">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-cyan">{x.kind}</span>
                  <span className="text-[13px] text-mute">{x.page_path}{x.signed_in ? " · signed in" : ""}</span>
                  <span className="ml-auto text-[12.5px] text-dim">{new Date(x.created_at * 1000).toLocaleString("en-IN")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ink">{x.message}</p>
                <p className="mt-1 text-[12.5px] text-dim">{x.contact ? `Contact: ${x.contact}` : "No contact left, so it cannot be answered."}</p>
              </li>
            ))}
            {data.contacts.map((x) => (
              <li key={x.id} className="border-t border-white/10 py-3 text-[14px]">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-cyan">contact</span>
                  <span className="text-[13px] text-mute">{x.name}</span>
                  <span className="ml-auto text-[12.5px] text-dim">{x.created_at}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ink">{x.message}</p>
                {x.email && <p className="mt-1 text-[12.5px]"><a className="text-cyan underline" href={`mailto:${x.email}`}>{x.email}</a></p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sub mt-2">No feedback in this period.</p>
        )}
      </Card>
    </>
  );
}
