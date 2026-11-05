"use client";

import { useMemo, useState } from "react";
import { SITES } from "@/lib/config";
import { useOptimizer } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { Experiment } from "@/lib/types";
import { Card, SkTable } from "@/components/ui";

const STATUS: Record<Experiment["status"], string> = { report: "Report only", proposed: "Pull request open", live: "Live, measuring", done: "Judged", declined: "Declined" };
const VERDICT: Record<string, string> = { better: "bg-good/10 text-good", worse: "bg-bad/10 text-bad", same: "bg-white/5 text-mute", inconclusive: "bg-white/5 text-dim" };
const TYPE: Record<string, string> = { title: "Title", description: "Description", section: "New section", faq: "FAQ entry", internal_link: "Internal link", none: "No change" };
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

function Row({ e }: { e: Experiment }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className="font-mono text-[11.5px] text-dim">{e.created}</span>
        <span className="text-[12.5px] text-mute">{SITES[e.host] || e.host}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={e.page}>{path(e.page)}</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-mute">{TYPE[e.type] || e.type}</span>
        {e.verdict ? <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${VERDICT[e.verdict]}`}>{e.verdict}{e.delta ? ` · ${e.delta.pos > 0 ? "▲" : e.delta.pos < 0 ? "▼" : ""}${Math.abs(e.delta.pos)} pos` : ""}</span> : <span className="font-mono text-[11px] text-dim">{STATUS[e.status]}</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-[10px] bg-card2 p-3 text-[12.5px] leading-relaxed text-mute">
          {e.q ? <div><b className="text-ink">Query:</b> &ldquo;{e.q}&rdquo; · position {e.baseline.pos}, {e.baseline.impr} impressions, CTR {e.baseline.ctr}% when proposed</div> : <div><b className="text-ink">Goal:</b> get the page indexed. Google said: {e.state}</div>}
          {e.gap && <div><b className="text-ink">Gap:</b> {e.gap}</div>}
          {!!e.competitors?.length && (
            <div>
              <b className="text-ink">What outranks us:</b>
              <ul className="mt-1 list-disc pl-5">{e.competitors.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer" className="break-all text-brand">{c.url}</a>: {c.does_better}</li>)}</ul>
            </div>
          )}
          {e.type !== "none" && (
            <>
              <div><b className="text-ink">Why:</b> {e.rationale}</div>
              <div><b className="text-ink">Before:</b> <span className="whitespace-pre-wrap">{e.before}</span></div>
              <div><b className="text-ink">After:</b> <span className="whitespace-pre-wrap text-ink">{e.after}</span></div>
            </>
          )}
          {e.type === "none" && <div><b className="text-ink">Decision:</b> {e.rationale}{e.authorityGap ? " The gap looks like authority (links), not content." : ""}</div>}
          {e.pr && <div><a href={e.pr.url} target="_blank" rel="noreferrer" className="text-brand">Open the pull request</a> · {e.pr.file}</div>}
          {e.note && <div className="text-dim">{e.note}</div>}
          {e.revertPr && <div>Revert: {e.revertPr.startsWith("http") ? <a href={e.revertPr} className="text-brand" target="_blank" rel="noreferrer">{e.revertPr}</a> : e.revertPr}</div>}
        </div>
      )}
    </li>
  );
}

/** What the weekly optimizer proposed, what is live, and how each change turned out. */
export function OptimizerCard() {
  const f = useFilters();
  const e = useOptimizer();
  const calc = useMemo(() => {
    if (!e.data) return null;
    const list = e.data.experiments.filter((x) => f.site === "all" || x.host === f.site).slice().reverse();
    const done = list.filter((x) => x.verdict);
    const wins = done.filter((x) => x.verdict === "better").length;
    const losses = done.filter((x) => x.verdict === "worse").length;
    return { list, done: done.length, wins, losses, open: list.filter((x) => x.status === "proposed").length, live: list.filter((x) => x.status === "live").length, run: e.data.lastRun };
  }, [e.data, f.site]);
  if (e.error && !e.data) return <Card title="Content optimizer"><p className="sub">No run yet. It runs every Monday at 09:00 IST: picks a few pages just off page one, reads what outranks them, proposes one change each as a pull request, and judges last month&apos;s changes.</p></Card>;
  if (!calc) return <SkTable />;
  const modeNote = calc.run.mode === "pr" ? "Pull requests on." : calc.run.mode === "dry" ? "Last run was a dry run (reports only)." : "Reports only until a GitHub token is added.";
  return (
    <Card title="Content optimizer" note={`Last run ${calc.run.date}: ${calc.run.proposed} proposal(s), ${calc.run.judged} judged, about $${calc.run.costUsd.toFixed(2)}. ${modeNote} Each change is one experiment: judged against Search Console after 28 days, reverted if worse, and the verdict feeds the next proposals.`}>
      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[12px]">
        <span className="rounded-md bg-white/5 px-2.5 py-1 text-mute">{calc.open} open PR{calc.open === 1 ? "" : "s"}</span>
        <span className="rounded-md bg-white/5 px-2.5 py-1 text-mute">{calc.live} measuring</span>
        <span className="rounded-md bg-good/10 px-2.5 py-1 text-good">{calc.wins} better</span>
        <span className={`rounded-md px-2.5 py-1 ${calc.losses ? "bg-bad/10 text-bad" : "bg-white/5 text-mute"}`}>{calc.losses} worse</span>
        {calc.done > 0 && <span className="rounded-md bg-white/5 px-2.5 py-1 text-mute">win rate {Math.round((100 * calc.wins) / calc.done)}%</span>}
      </div>
      {calc.list.length === 0 ? <p className="sub">Nothing proposed for this site yet.</p> : <ul className="mt-3">{calc.list.slice(0, 40).map((x) => <Row key={x.id} e={x} />)}</ul>}
    </Card>
  );
}
