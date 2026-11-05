"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITES } from "@/lib/config";
import { getApiBase, useOptimizer } from "@/lib/data";
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

interface Pr {
  repo: string;
  number: number;
  title: string;
  url: string;
  body: string;
  branch: string;
  created: string;
  checks: "success" | "pending" | "failure" | "none";
}
const PASS_KEY = "merge-passphrase";
const siteOfRepo = (repo: string) => ({ "Yaseenyk/portfolio": "Portfolio", "Yaseenyk/streamer-os-website": "streamerOS", "Yaseenyk/fitrank-website": "FitRank", "Yaseenyk/campus-site": "DefendIt", "Yaseenyk/spotai-website": "SpotAI", "Yaseenyk/solar-site": "Solar Guide" })[repo] || repo;
const CHECK: Record<Pr["checks"], [string, string]> = { success: ["Checks passed", "bg-good/10 text-good"], pending: ["Checks running", "bg-white/5 text-mute"], failure: ["Checks failed", "bg-bad/10 text-bad"], none: ["No checks yet", "bg-white/5 text-dim"] };
const agoDays = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 864e5));

/** The optimizer's open pull requests, with Merge and Decline. Merging asks once for your passphrase, kept in this browser. */
function PullRequests() {
  const [prs, setPrs] = useState<Pr[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string>("");
  const [pass, setPass] = useState("");
  const [askFor, setAskFor] = useState<{ pr: Pr; action: "merge" | "close" } | null>(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");
  const base = getApiBase();
  const load = useCallback(async () => {
    if (!base) return;
    try {
      const r = await fetch(`${base}/optimizer/prs`, { cache: "no-store" });
      const j = await r.json();
      setPrs(j.prs || []);
      setErr(j.error ? "The Worker has no GitHub token yet." : "");
    } catch {
      setErr("Could not reach the live service.");
    }
  }, [base]);
  useEffect(() => {
    load();
    try {
      setPass(localStorage.getItem(PASS_KEY) || "");
    } catch {
      /* private window */
    }
  }, [load]);
  const run = async (pr: Pr, action: "merge" | "close", p: string) => {
    setBusy(`${pr.repo}#${pr.number}`);
    setFlash("");
    try {
      const r = await fetch(`${base}/optimizer/action`, { method: "POST", headers: { "Content-Type": "application/json", "X-Passphrase": p }, body: JSON.stringify({ repo: pr.repo, number: pr.number, action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401) { setPass(""); try { localStorage.removeItem(PASS_KEY); } catch { /* ignore */ } setAskFor({ pr, action }); }
        setFlash(j.error || `Failed (${r.status}).`);
      } else {
        try { localStorage.setItem(PASS_KEY, p); } catch { /* ignore */ }
        setPass(p);
        setAskFor(null);
        setPrs((cur) => (cur || []).filter((x) => !(x.repo === pr.repo && x.number === pr.number)));
        setFlash(action === "merge" ? `Merged ${siteOfRepo(pr.repo)} #${pr.number}. The site redeploys now; the optimizer starts measuring it at its next run.` : `Declined ${siteOfRepo(pr.repo)} #${pr.number}.`);
      }
    } catch {
      setFlash("Could not reach the live service.");
    }
    setBusy("");
  };
  const act = (pr: Pr, action: "merge" | "close") => (pass ? run(pr, action, pass) : setAskFor({ pr, action }));
  if (!base) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-semibold">Pull requests waiting for you{prs ? ` (${prs.length})` : ""}</h3>
        <button type="button" onClick={load} className="pill">Refresh</button>
      </div>
      {err && <p className="sub">{err}</p>}
      {flash && <p role="status" className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink">{flash}</p>}
      {prs && prs.length === 0 && !err && <p className="sub">Nothing waiting. New pull requests appear here after the Monday run.</p>}
      {askFor && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] bg-card2 p-3"
          onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("pass") as string) || ""; if (v) run(askFor.pr, askFor.action, v); }}
        >
          <span className="text-[12.5px] text-mute">Your passphrase to {askFor.action === "merge" ? "merge" : "decline"} #{askFor.pr.number}:</span>
          <input name="pass" type="password" autoComplete="current-password" className="min-w-[160px] flex-1" placeholder="passphrase" />
          <button type="submit" className="rounded-[10px] bg-brand px-3 py-1.5 font-semibold text-black">Confirm</button>
          <button type="button" onClick={() => setAskFor(null)} className="pill">Cancel</button>
        </form>
      )}
      <ul className="mt-2">
        {(prs || []).map((pr) => {
          const key = `${pr.repo}#${pr.number}`;
          const [label, tone] = CHECK[pr.checks];
          return (
            <li key={key} className="border-t border-line py-2.5 first:border-t-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[12.5px] text-mute">{siteOfRepo(pr.repo)}</span>
                <button type="button" onClick={() => setOpen(open === key ? "" : key)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:text-brand" title="Show the change">{pr.title.replace(/^seo\(optimizer\):\s*/, "")}</button>
                <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${tone}`}>{label}</span>
                <span className="font-mono text-[11px] text-dim">{agoDays(pr.created)} d</span>
                <a href={pr.url} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-brand">#{pr.number}</a>
                <button type="button" disabled={busy === key || pr.checks === "failure" || pr.checks === "pending"} onClick={() => act(pr, "merge")} className="rounded-[9px] bg-brand px-3 py-1 text-[12.5px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40" title={pr.checks === "pending" ? "Wait for the checks" : pr.checks === "failure" ? "The site's checks failed: open the pull request to see why" : "Merge into main; the site redeploys"}>{busy === key ? "…" : "Merge"}</button>
                <button type="button" disabled={busy === key} onClick={() => act(pr, "close")} className="pill">Decline</button>
              </div>
              {open === key && <pre className="mt-2 whitespace-pre-wrap break-words rounded-[10px] bg-card2 p-3 font-sans text-[12.5px] leading-relaxed text-mute">{pr.body}</pre>}
            </li>
          );
        })}
      </ul>
    </div>
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
  if (e.error && !e.data) return <Card title="Content optimizer"><PullRequests /><p className="sub">No run yet. It runs every Monday at 09:00 IST: picks a few pages just off page one, reads what outranks them, proposes one change each as a pull request, and judges last month&apos;s changes.</p></Card>;
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
      <PullRequests />
      {calc.list.length === 0 ? <p className="sub">Nothing proposed for this site yet.</p> : <ul className="mt-3">{calc.list.slice(0, 40).map((x) => <Row key={x.id} e={x} />)}</ul>}
    </Card>
  );
}
