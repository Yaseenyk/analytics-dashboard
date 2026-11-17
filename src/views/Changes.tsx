"use client";

import { useMemo } from "react";
import { SITES } from "@/lib/config";
import { useChanges, useGSC, useHistory, useOptimizer } from "@/lib/data";
import { readChanges, type Reading, type Verdict } from "@/lib/changes";
import { Card, Sk } from "@/components/ui";
import { DataTable } from "@/components/DataTable";

const VERDICT: Record<Verdict, string> = { helped: "✓ Helped", hurt: "✗ Hurt", "no-effect": "– No clear effect", "too-early": "… Too early" };
const TONE: Record<Verdict, string> = { helped: "text-good", hurt: "text-bad", "no-effect": "text-ink", "too-early": "text-dim" };
const KIND: Record<string, string> = { indexing: "Indexing", content: "Page text", technical: "Technical", quality: "Quality clean-up", "new-content": "New pages" };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short" });
const fix = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));
const hostNames = (h: string[]) => (h.length > 3 ? `${h.length} sites` : h.map((x) => SITES[x] ?? x).join(", "));

const tile = (label: string, value: number, sub: string, tone = "") => (
  <div key={label} className="card flex flex-col !p-3.5">
    <div className="truncate text-[12.5px] text-mute">{label}</div>
    <div className={`mt-2 text-[28px] font-semibold leading-none tracking-tight ${tone}`}>{value}</div>
    <div className="mt-2 truncate text-[12px] leading-4 text-dim">{sub}</div>
  </div>
);

export default function Changes() {
  const log = useChanges().data;
  const gsc = useGSC("3m").data;
  const hist = useHistory().data;
  const opt = useOptimizer().data;

  const readings = useMemo<Reading[] | null>(() => (log && gsc ? readChanges(log, gsc, hist ?? []) : null), [log, gsc, hist]);
  const count = (v: Verdict) => (readings ?? []).filter((r) => r.verdict === v).length;
  const frozen = !!log?.freezeUntil && new Date().toISOString().slice(0, 10) < log.freezeUntil;
  const experiments = (opt?.experiments ?? []).filter((e) => e.status === "live" || e.status === "done" || e.status === "proposed");

  if (!log) return <div className="space-y-4"><Sk w="100%" h={84} /><Sk w="100%" h={160} /></div>;

  return (
    <div className="space-y-4">
      {log.freezeUntil && (
        <Card title={frozen ? `Frozen until ${shortDate(log.freezeUntil)}` : "Freeze is over"}>
          <p className="sub mt-2">{log.freezeNote}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {tile("Helped", count("helped"), "pages in Google or impressions up", count("helped") ? "text-good" : "")}
        {tile("Hurt", count("hurt"), "pages lost or clicks down", count("hurt") ? "text-bad" : "")}
        {tile("No clear effect", count("no-effect"), "numbers barely moved")}
        {tile("Too early", count("too-early"), "less than 7 days of data")}
      </div>
      <p className="sub !mt-0 px-1">Each change is compared with the 14 days before it and the days after it (up to 28), from Search Console and the daily index check. This is a reading, not proof: when several things change in the same week we cannot say which one did it, and the table says so.</p>

      {!readings ? (
        <Sk w="100%" h={160} />
      ) : (
        <>
          <DataTable
            title="Every change and what it did"
            note="Newest first. Slide sideways for the numbers."
            cols={["Change", "Date", "Sites", "Type", "Days", "Pages in Google", "Clicks a day", "Impressions a day", "Verdict"]}
            fmt={[0, 0, 0, 0, "n", 0, 0, 0, 0]}
            sort={4}
            max={12}
            empty="No changes logged yet."
            rows={readings.slice().reverse().map((r) => [
              r.change.title,
              shortDate(r.change.date),
              hostNames(r.change.hosts),
              KIND[r.change.kind] ?? r.change.kind,
              r.days,
              r.idxAt !== null && r.idxNow !== null ? `${r.idxAt} → ${r.idxNow}` : "–",
              `${fix(r.clicksBefore)} → ${fix(r.clicksAfter)}`,
              `${fix(r.imprBefore)} → ${fix(r.imprAfter)}`,
              VERDICT[r.verdict],
            ])}
          />

          <Card title="The story behind each one" note="What we did, what we hoped for, and what the numbers say.">
            <ul className="m-0 mt-3 list-none space-y-3 p-0">
              {readings.slice().reverse().map((r) => (
                <li key={r.change.id} className="rounded-xl bg-white/[.03] px-3 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <b className="min-w-0 text-[14px]">{r.change.title}</b>
                    <span className={`shrink-0 text-[12.5px] font-semibold ${TONE[r.verdict]}`}>{VERDICT[r.verdict]}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-dim">{shortDate(r.change.date)} · {hostNames(r.change.hosts)} · {KIND[r.change.kind] ?? r.change.kind}</div>
                  <p className="m-0 mt-2 text-[13px] leading-relaxed text-mute">{r.change.detail}</p>
                  <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-mute"><b className="font-medium text-ink">Hoped for: </b>{r.change.expect}</p>
                  <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-mute"><b className="font-medium text-ink">Numbers: </b>{r.why}</p>
                  {r.overlaps.length > 0 && <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-yellow-300/90">Other changes landed within a week on the same sites ({r.overlaps.join("; ")}), so the effect cannot be separated.</p>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {experiments.length > 0 && (
        <DataTable
          title="Optimizer experiments"
          note="One change per page, judged by the optimizer 28 days after it goes live."
          cols={["Page", "Change", "Live since", "Judged on", "Verdict"]}
          fmt={[0, 0, 0, 0, 0]}
          max={8}
          rows={experiments.map((e) => [e.page.replace(/^https?:\/\//, ""), e.type, e.liveSince ?? "not live yet", e.judgeAfter ?? "–", e.verdict ?? (e.status === "live" ? "waiting" : e.status)])}
        />
      )}
    </div>
  );
}
