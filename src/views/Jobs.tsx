"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBase } from "@/lib/data";
import { Card } from "@/components/ui";

interface Job {
  id: string;
  title: string;
  schedule: string;
  what: string;
  repo: string;
  /** Workflow file, or empty to read every workflow in the repo. */
  file: string;
  /** Name the Worker accepts for a re-run. Jobs without one are status only. */
  rerun?: "health" | "dashboard";
  /** Runs inside the Cloudflare Worker (its own status), not on GitHub. */
  worker?: boolean;
  /** Shown next to the button: the server enforces it. */
  cooldown?: string;
  note?: string;
}

const JOBS: Job[] = [
  { id: "health", title: "Index health check", schedule: "Daily at 02:40 UTC (08:10 IST)", what: "Asks Google whether each page of all eight sites is indexed, and why not.", repo: "Yaseenyk/analytics-dashboard", file: "", worker: true, rerun: "health", cooldown: "once every 90 minutes", note: "Runs on Cloudflare, in small batches every minute, so a full check takes about 20 minutes. The Health tab updates the moment it finishes." },
  { id: "dashboard", title: "Dashboard data and deploy", schedule: "Every 2 hours, and on every push", what: "Pulls Google Analytics, Search Console and Bing, then rebuilds and publishes this dashboard.", repo: "Yaseenyk/analytics-dashboard", file: "dashboard.yml", rerun: "dashboard", cooldown: "once every 10 minutes", note: "Takes about 2 minutes." },
  { id: "portfolio", title: "Portfolio deploy", schedule: "Daily at 00:17 UTC, and on every push", what: "Rebuilds yk.streamerosai.com and releases pages and posts whose date has come.", repo: "Yaseenyk/portfolio", file: "deploy.yml" },
  { id: "linkedin", title: "LinkedIn poster", schedule: "Tue, Wed, Thu at 10:00 UTC", what: "Publishes the next LinkedIn post. A re-run would publish a real post, so this one is status only.", repo: "Yaseenyk/linkedin-bot", file: "" },
];

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  event: string;
  display_title: string;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return "just now";
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function useRuns(job: Job) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const path = job.file ? `workflows/${job.file}/runs` : "runs";
      const r = await fetch(`https://api.github.com/repos/${job.repo}/actions/${path}?per_page=6`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setRuns(j.workflow_runs as Run[]);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [job.file, job.repo]);
  useEffect(() => {
    load();
  }, [load]);
  const active = !!runs?.some((r) => r.status === "in_progress" || r.status === "queued");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [active, load]);
  return { runs, failed, reload: load, active };
}

function state(r: Run) {
  if (r.status !== "completed") return { label: r.status === "queued" ? "Queued" : "Running", tone: "text-brand bg-brand/10", dot: "bg-brand animate-pulse" };
  if (r.conclusion === "success") return { label: "Succeeded", tone: "text-good bg-good/10", dot: "bg-good" };
  if (r.conclusion === "cancelled") return { label: "Cancelled", tone: "text-mute bg-white/5", dot: "bg-dim" };
  return { label: "Failed", tone: "text-bad bg-bad/10", dot: "bg-bad" };
}

function JobCard({ job }: { job: Job }) {
  const { runs, failed, reload, active } = useRuns(job);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const last = runs?.[0];
  const s = last ? state(last) : null;

  async function rerun() {
    if (!job.rerun) return;
    setBusy(true);
    setMsg(null);
    try {
      const base = getApiBase();
      if (!base) throw new Error("The live service is switched off on this page (?api=off).");
      const r = await fetch(`${base}/rerun/${job.rerun}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setMsg({ ok: true, text: "Started. This card updates as it runs." });
      setTimeout(reload, 4000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not start it." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={job.title}>
      <p className="sub">{job.what}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-dim">Schedule</dt>
        <dd className="text-mute">{job.schedule}</dd>
        <dt className="text-dim">Last run</dt>
        <dd>
          {failed && !runs ? <span className="text-dim">Could not read GitHub right now.</span> : !runs ? <span className="text-dim">Loading…</span> : !last ? <span className="text-dim">No runs yet.</span> : (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-semibold ${s!.tone}`}>
                <i className={`h-1.5 w-1.5 rounded-full ${s!.dot}`} />{s!.label}
              </span>
              <span className="text-mute">{ago(last.created_at)}</span>
              <a href={last.html_url} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-4">view run</a>
            </span>
          )}
        </dd>
        <dt className="text-dim">Recent</dt>
        <dd className="flex items-center gap-1.5" aria-label="Recent runs, newest first">
          {(runs ?? []).map((r) => (
            <a key={r.id} href={r.html_url} target="_blank" rel="noopener noreferrer" title={`${state(r).label}, ${ago(r.created_at)}`} className={`h-3 w-3 rounded-full ${state(r).dot.replace("animate-pulse", "")} hover:ring-2 hover:ring-white/30`} />
          ))}
          {runs && !runs.length && <span className="text-dim">none</span>}
        </dd>
      </dl>
      {job.note && <p className="sub">{job.note}</p>}

      {job.rerun && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" onClick={rerun} disabled={busy || active} className="rounded-[10px] bg-brand px-4 py-2 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {active ? "Running…" : busy ? "Starting…" : "Re-run now"}
          </button>
          <span className="text-[12.5px] text-dim">Open to anyone, {job.cooldown}.</span>
          {msg && <span className={`text-[12.5px] ${msg.ok ? "text-good" : "text-bad"}`} role="status">{msg.text}</span>}
        </div>
      )}
    </Card>
  );
}

interface WorkerStatus {
  running: boolean;
  stage: string | null;
  done: number;
  total: number;
  startedAt: number | null;
  lastFinished: string | null;
  lastStart: number | null;
}

function WorkerJobCard({ job }: { job: Job }) {
  const [st, setSt] = useState<WorkerStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const base = getApiBase();
      if (!base) throw new Error("off");
      const r = await fetch(`${base}/status/health`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setSt((await r.json()) as WorkerStatus);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const running = !!st?.running;
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(), running ? 5000 : 60000);
    return () => clearInterval(t);
  }, [running, load]);

  async function rerun() {
    setBusy(true);
    setMsg(null);
    try {
      const base = getApiBase();
      if (!base) throw new Error("The live service is switched off on this page (?api=off).");
      const r = await fetch(`${base}/rerun/health`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setMsg({ ok: true, text: "Started. Progress shows below." });
      setTimeout(load, 1500);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not start it." });
    } finally {
      setBusy(false);
    }
  }
  const pct = st && st.total ? Math.round((100 * st.done) / st.total) : 0;
  return (
    <Card title={job.title}>
      <p className="sub">{job.what}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-dim">Schedule</dt>
        <dd className="text-mute">{job.schedule}</dd>
        <dt className="text-dim">Status</dt>
        <dd>
          {failed && !st ? <span className="text-dim">Could not reach the service right now.</span> : !st ? <span className="text-dim">Loading…</span> : running ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-brand"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />{st.stage === "plan" ? "Listing pages" : `Checking ${st.done} of ${st.total}`}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-good/10 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-good"><i className="h-1.5 w-1.5 rounded-full bg-good" />Idle</span>
          )}
        </dd>
        <dt className="text-dim">Last finished</dt>
        <dd className="text-mute">{st?.lastFinished ? `${ago(st.lastFinished)}` : "not yet"}</dd>
      </dl>
      {running && st && st.total > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-purple transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {job.note && <p className="sub">{job.note}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={rerun} disabled={busy || running} className="rounded-[10px] bg-brand px-4 py-2 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {running ? "Running…" : busy ? "Starting…" : "Re-run now"}
        </button>
        <span className="text-[12.5px] text-dim">Open to anyone, {job.cooldown}.</span>
        {msg && <span className={`text-[12.5px] ${msg.ok ? "text-good" : "text-bad"}`} role="status">{msg.text}</span>}
      </div>
    </Card>
  );
}

export default function Jobs() {
  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {JOBS.map((j) => (j.worker ? <WorkerJobCard key={j.id} job={j} /> : <JobCard key={j.id} job={j} />))}
      </div>
      <p className="sub">Status comes straight from GitHub and updates while a job is running. The cooldowns protect Google&apos;s daily limits and are enforced by the server, not this page.</p>
    </>
  );
}
