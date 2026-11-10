"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CONCIERGE_API } from "@/lib/config";
import { getApiBase } from "@/lib/data";
import { Card } from "@/components/ui";

interface Job {
  id: string;
  title: string;
  schedule: string;
  what: string;
  /** Section the card sits in. */
  group: string;
  repo: string;
  /** Workflow file, or empty to read every workflow in the repo. */
  file: string;
  /** Name the Worker accepts for a re-run. Jobs without one are status only. */
  rerun?: "health" | "dashboard";
  /** Runs inside the Cloudflare Worker (its own status), not on GitHub. */
  worker?: boolean;
  /** A Cloudflare cron with no status feed: shown for completeness. */
  external?: boolean;
  /** Shown next to the button: the server enforces it. */
  cooldown?: string;
  note?: string;
}

const G_POST = "Posting and content";
const G_DEPLOY = "Daily releases and site deploys";
const G_CF = "Cloudflare Workers";
const G_TOOLS = "Tool sites (their own repo)";
const GROUPS = [G_POST, G_DEPLOY, G_CF, G_TOOLS];

const JOBS: Job[] = [
  // ---- posting and content
  { id: "linkedin", group: G_POST, title: "LinkedIn poster", schedule: "Tue, Wed, Thu at 10:00 UTC (15:30 IST)", what: "Publishes the next LinkedIn post from the bot's queue, on a fixed cycle of post, post, meme, post, poll.", repo: "Yaseenyk/linkedin-bot", file: "linkedin_poster.yml", note: "Status only: a re-run would publish a real post." },
  { id: "sos-blogger", group: G_POST, title: "streamerOS blogger", schedule: "Mon and Thu at 09:00 UTC (14:30 IST)", what: "Writes one post for the next real search query on its topic list, using only facts from the site's knowledge base, and publishes it. A run that fails its own checks publishes nothing.", repo: "Yaseenyk/streamer-os-website", file: "ai_blogger.yml", note: "Status only: a re-run would publish a new post. The publish triggers the streamerOS deploy." },
  { id: "devto-backfill", group: G_POST, title: "DEV.to cross-posting: backlog", schedule: "Tue and Fri at 04:30 UTC (10:00 IST)", what: "Cross-posts one older portfolio article to DEV.to per run, with tagged links. Never more than 2 new articles in any 7 days.", repo: "Yaseenyk/portfolio", file: "dev-to-backfill.yml", note: "Status only." },
  { id: "devto-sync", group: G_POST, title: "DEV.to cross-posting: new posts", schedule: "On every push to the portfolio", what: "Cross-posts new or edited portfolio articles to DEV.to, inside the same 2-a-week limit.", repo: "Yaseenyk/portfolio", file: "dev-to-sync.yml", note: "Status only." },

  // ---- daily releases and site deploys
  { id: "portfolio", group: G_DEPLOY, title: "Portfolio deploy", schedule: "Daily at 00:17 UTC (05:47 IST), and on every push", what: "Rebuilds yk.streamerosai.com and releases pages and posts whose date has come.", repo: "Yaseenyk/portfolio", file: "deploy.yml" },
  { id: "fitrank", group: G_DEPLOY, title: "FitRank deploy", schedule: "Daily at 00:30 UTC (06:00 IST), and on every push", what: "Rebuilds fitrank.streamerosai.com and releases scheduled blog stories on their date.", repo: "Yaseenyk/fitrank-website", file: "deploy.yml" },
  { id: "spotai", group: G_DEPLOY, title: "SpotAI deploy", schedule: "Daily at 00:17 UTC (05:47 IST), and on every push", what: "Rebuilds spotai.streamerosai.com and releases scheduled guides on their date.", repo: "Yaseenyk/spotai-website", file: "deploy.yml" },
  { id: "streameros", group: G_DEPLOY, title: "streamerOS deploy", schedule: "On every push", what: "Rebuilds streamerosai.com. The blogger's posts go live through this.", repo: "Yaseenyk/streamer-os-website", file: "nextjs.yml" },
  { id: "campus", group: G_DEPLOY, title: "DefendIt deploy", schedule: "On every push", what: "Rebuilds campus.streamerosai.com.", repo: "Yaseenyk/campus-site", file: "deploy.yml" },
  { id: "solar", group: G_DEPLOY, title: "Solar guide deploy", schedule: "On every push", what: "Rebuilds solar.streamerosai.com.", repo: "Yaseenyk/solar-site", file: "deploy.yml" },
  { id: "exams", group: G_DEPLOY, title: "Exam Dates deploy", schedule: "Daily at 00:20 UTC (05:50 IST), and on every push", what: "Rebuilds exams.streamerosai.com and drops dates that have passed from its Coming up list.", repo: "Yaseenyk/exams", file: "deploy.yml" },
  { id: "clarity", group: G_DEPLOY, title: "Clarity export", schedule: "Daily at 04:10 UTC (09:40 IST)", what: "Pulls behaviour numbers (scroll depth, rage and dead clicks, quick backs, script errors) from Microsoft Clarity for each site that has a token.", repo: "Yaseenyk/analytics-dashboard", file: "clarity.yml", note: "Status only. Clarity allows 10 requests per project per day, so it runs once a day." },
  { id: "dashboard", group: G_DEPLOY, title: "Dashboard data and deploy", schedule: "Every 2 hours, and on every push", what: "Pulls Google Analytics, Search Console and Bing, then rebuilds and publishes this dashboard.", repo: "Yaseenyk/analytics-dashboard", file: "dashboard.yml", rerun: "dashboard", cooldown: "once every 10 minutes", note: "Takes about 2 minutes." },

  // ---- Cloudflare
  { id: "health", group: G_CF, title: "Index health check", schedule: "Daily at 02:40 UTC (08:10 IST)", what: "Asks Google whether each page of all nine sites is indexed, and why not.", repo: "Yaseenyk/analytics-dashboard", file: "", worker: true, rerun: "health", cooldown: "once every 90 minutes", note: "Runs on Cloudflare, in small batches every minute, so a full check takes about 20 minutes. The Health tab updates the moment it finishes." },
  { id: "reindex", group: G_CF, title: "Chat re-index", schedule: "Daily at 11:30 UTC (17:00 IST)", what: "Re-reads the live portfolio text and refreshes the search index behind the portfolio's chat assistant.", repo: "", file: "", external: true, note: "Runs on the chat assistant's own Worker, which reports each run." },
  { id: "concierge", group: G_CF, title: "Chat assistant deploy", schedule: "On every push that changes the Worker", what: "Publishes the chat assistant's Worker to Cloudflare.", repo: "Yaseenyk/portfolio", file: "worker.yml" },

  // ---- tool sites (separate session and repo)
  { id: "tools", group: G_TOOLS, title: "tools.streamerosai.com deploy", schedule: "On every push", what: "Publishes the JSON and developer tools site.", repo: "Yaseenyk/sites-lab-yk", file: "deploy-tools.yml" },
  { id: "calc", group: G_TOOLS, title: "calc.streamerosai.com deploy", schedule: "On every push", what: "Publishes the money calculators site.", repo: "Yaseenyk/sites-lab-yk", file: "deploy-calc.yml" },
  { id: "images", group: G_TOOLS, title: "images.streamerosai.com deploy", schedule: "On every push", what: "Publishes the image tools site.", repo: "Yaseenyk/sites-lab-yk", file: "deploy-images.yml" },
  { id: "math", group: G_TOOLS, title: "math.streamerosai.com deploy", schedule: "On every push", what: "Publishes the math calculators site.", repo: "Yaseenyk/sites-lab-yk", file: "deploy-math.yml" },
];

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  event: string;
  display_title: string;
  path?: string;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return "just now";
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/* One GitHub request per repository, shared by every card for 60 seconds: with 18 jobs, one request each would run into GitHub's
   limit for anonymous callers (60 an hour). Each run carries its workflow file in `path`, so a card picks out its own. */
const repoCache = new Map<string, { at: number; p: Promise<Run[]> }>();
function repoRuns(repo: string, force = false): Promise<Run[]> {
  const hit = repoCache.get(repo);
  if (hit && !force && Date.now() - hit.at < 60000) return hit.p;
  const p = fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100`, { headers: { Accept: "application/vnd.github+json" } }).then(async (r) => {
    if (!r.ok) throw new Error(String(r.status));
    return ((await r.json()).workflow_runs ?? []) as Run[];
  });
  repoCache.set(repo, { at: Date.now(), p });
  p.catch(() => repoCache.delete(repo));
  return p;
}
const ofJob = (all: Run[], job: Job) => (job.file ? all.filter((r) => r.path?.endsWith(`/${job.file}`)) : all).slice(0, 6);

/* Each card reports its latest run here so the summary strip at the top can count them without asking GitHub again. */
const lastRuns = new Map<string, Run | null>();
const listeners = new Set<() => void>();
const publish = (id: string, run: Run | null) => {
  lastRuns.set(id, run);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => JOBS.filter((j) => lastRuns.has(j.id)).map((j) => `${j.id}:${lastRuns.get(j.id)?.status ?? "none"}/${lastRuns.get(j.id)?.conclusion ?? ""}`).join("|");

function useRuns(job: Job) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    async (force = false) => {
      try {
        let mine = ofJob(await repoRuns(job.repo, force), job);
        if (!mine.length && job.file) {
          // A job that runs rarely can fall outside the newest 100 runs of a busy repository: ask for its workflow directly.
          const r = await fetch(`https://api.github.com/repos/${job.repo}/actions/workflows/${job.file}/runs?per_page=6`, { headers: { Accept: "application/vnd.github+json" } });
          if (r.ok) mine = ((await r.json()).workflow_runs ?? []) as Run[];
        }
        setRuns(mine);
        publish(job.id, mine[0] ?? null);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [job],
  );
  useEffect(() => {
    load();
  }, [load]);
  const active = !!runs?.some((r) => r.status === "in_progress" || r.status === "queued");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(true), 20000);
    return () => clearInterval(t);
  }, [active, load]);
  return { runs, failed, reload: () => load(true), active };
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
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-purple bar-grow transition-all" style={{ width: `${pct}%` }} />
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

interface ReindexRun {
  at: string;
  trigger: string;
  ok: boolean;
  baseline: boolean;
  articles: number;
  chunks: number;
  embedded: number;
  added: { url: string; title: string }[];
  changed: { url: string; title: string }[];
  removed: { url: string; title: string }[];
  error?: string | null;
  ms: number;
}
const PASS_KEY = "merge-passphrase";

/** The chat assistant's nightly re-index: when it ran, what it found new, changed or removed, and where that went. */
function ReindexCard({ job }: { job: Job }) {
  const [runs, setRuns] = useState<ReindexRun[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState(false);
  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`${CONCIERGE_API}/status/reindex`, { cache: "no-store" })).json();
      setRuns(j.runs || []);
      setErr(j.error || "");
    } catch {
      setErr("Could not reach the chat assistant's Worker.");
    }
  }, []);
  useEffect(() => {
    load();
    publish(job.id, null);
  }, [load, job.id]);
  const run = async (pass: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`${CONCIERGE_API}/api/reindex`, { method: "POST", headers: { "X-Passphrase": pass } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401) { try { localStorage.removeItem(PASS_KEY); } catch { /* ignore */ } setAsk(true); }
        setMsg(j.error || `Failed (${r.status}).`);
      } else {
        try { localStorage.setItem(PASS_KEY, pass); } catch { /* ignore */ }
        setAsk(false);
        setMsg("Started. It takes a minute or two; this card updates when it finishes.");
        setTimeout(load, 45000);
        setTimeout(load, 90000);
      }
    } catch {
      setMsg("Could not reach the chat assistant's Worker.");
    }
    setBusy(false);
  };
  const go = () => {
    let p = "";
    try { p = localStorage.getItem(PASS_KEY) || ""; } catch { /* ignore */ }
    if (p) run(p); else setAsk(true);
  };
  const last = runs?.[0];
  const lastOk = runs?.find((r) => r.ok);
  const tone = !last ? "bg-white/5 text-mute" : last.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad";
  const list = (title: string, items: { url: string; title: string }[]) =>
    items.length ? (
      <div className="mt-2">
        <div className="text-[12px] font-semibold text-ink">{title} ({items.length})</div>
        <ul className="mt-1 space-y-0.5">
          {items.map((x) => <li key={x.url} className="truncate text-[12.5px]"><a href={x.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" title={x.url}>{x.title}</a></li>)}
        </ul>
      </div>
    ) : null;
  return (
    <Card title={job.title}>
      <p className="sub">{job.what}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-dim">Schedule</dt>
        <dd className="text-mute">{job.schedule}</dd>
        <dt className="text-dim">Status</dt>
        <dd>
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-semibold ${tone}`}>
            <i className={`h-1.5 w-1.5 rounded-full ${last ? (last.ok ? "bg-good" : "bg-bad") : "bg-dim"}`} />
            {!runs ? "Loading…" : last ? `${last.ok ? "Succeeded" : "Failed"} ${ago(last.at)}` : "No run recorded yet"}
          </span>
        </dd>
        {last && last.ok && (
          <>
            <dt className="text-dim">Last run</dt>
            <dd className="text-mute">
              {last.baseline ? `First run with history: indexed all ${last.articles} articles (${last.chunks} passages) as the baseline.` : `${last.added.length} new, ${last.changed.length} updated, ${last.removed.length} removed. ${last.embedded} passages re-embedded of ${last.chunks} (${last.articles} articles).`}
            </dd>
            <dt className="text-dim">Where</dt>
            <dd className="text-mute">Search index <span className="font-mono text-[12px]">portfolio-corpus</span>, built from the portfolio&apos;s <a className="text-brand hover:underline" href="https://yk.streamerosai.com/llms-full.txt" target="_blank" rel="noopener noreferrer">llms-full.txt</a>. The chat assistant answers from it.</dd>
          </>
        )}
        {last && !last.ok && (
          <>
            <dt className="text-dim">Error</dt>
            <dd className="break-words text-bad">{last.error}</dd>
          </>
        )}
        {lastOk && last && !last.ok && (
          <>
            <dt className="text-dim">Last good run</dt>
            <dd className="text-mute">{ago(lastOk.at)}</dd>
          </>
        )}
      </dl>
      {err && <p className="sub">{err}</p>}
      {last && (last.added.length > 0 || last.changed.length > 0 || last.removed.length > 0) && (
        <div className="mt-2">
          {list("New in the index", last.added)}
          {list("Updated", last.changed)}
          {list("Removed", last.removed)}
        </div>
      )}
      {last && !last.baseline && !last.added.length && !last.changed.length && !last.removed.length && last.ok && <p className="sub">Nothing changed in the portfolio&apos;s text since the previous run, so nothing was re-embedded.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={go} className="rounded-[10px] bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-black disabled:opacity-50">{busy ? "Starting…" : "Run now"}</button>
        <button type="button" onClick={() => setOpen(!open)} className="pill">{open ? "Hide history" : `History (${runs?.length ?? 0})`}</button>
        <button type="button" onClick={load} className="pill">Refresh</button>
      </div>
      {ask && (
        <form className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] bg-card2 p-3" onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("pass") as string) || ""; if (v) run(v); }}>
          <span className="text-[12.5px] text-mute">Your passphrase:</span>
          <input name="pass" type="password" autoComplete="current-password" className="min-w-[160px] flex-1" placeholder="passphrase" />
          <button type="submit" className="rounded-[10px] bg-brand px-3 py-1.5 font-semibold text-black">Run</button>
        </form>
      )}
      {msg && <p role="status" className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink">{msg}</p>}
      {open && (
        <ul className="mt-3 border-t border-line">
          {(runs || []).map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2 text-[12.5px] last:border-0">
              <span className="font-mono text-[11.5px] text-dim">{new Date(r.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className={r.ok ? "text-good" : "text-bad"}>{r.ok ? "ok" : "failed"}</span>
              <span className="text-dim">{r.trigger}</span>
              <span className="min-w-0 flex-1 text-mute">{r.ok ? (r.baseline ? `baseline, ${r.articles} articles` : `${r.added.length} new · ${r.changed.length} updated · ${r.removed.length} removed`) : r.error}</span>
            </li>
          ))}
          {!runs?.length && <li className="py-2 text-dim">No runs recorded yet.</li>}
        </ul>
      )}
    </Card>
  );
}

function ExternalJobCard({ job }: { job: Job }) {
  return (
    <Card title={job.title}>
      <p className="sub">{job.what}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-dim">Schedule</dt>
        <dd className="text-mute">{job.schedule}</dd>
        <dt className="text-dim">Status</dt>
        <dd>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-mute">
            <i className="h-1.5 w-1.5 rounded-full bg-dim" />
            Not reported
          </span>
        </dd>
      </dl>
      {job.note && <p className="sub">{job.note}</p>}
    </Card>
  );
}

/** Counts across the GitHub jobs, from what each card has already loaded. */
function Summary() {
  useSyncExternalStore(subscribe, snapshot, () => "");
  const gh = JOBS.filter((j) => j.repo && !j.worker && !j.external);
  const seen = gh.filter((j) => lastRuns.has(j.id));
  const pick = (pred: (r: Run) => boolean) =>
    seen.filter((j) => {
      const r = lastRuns.get(j.id);
      return !!r && pred(r);
    });
  const running = pick((r) => r.status !== "completed");
  const ok = pick((r) => r.status === "completed" && r.conclusion === "success");
  const bad = pick((r) => r.status === "completed" && r.conclusion !== "success" && r.conclusion !== "cancelled");
  const none = seen.filter((j) => !lastRuns.get(j.id));
  const chip = (label: string, n: number, tone: string) => (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[12px] font-semibold ${tone}`}>
      {n} {label}
    </span>
  );
  return (
    <Card title={`${JOBS.length} automated jobs`}>
      {seen.length < gh.length ? (
        <p className="sub">
          Reading GitHub… {seen.length} of {gh.length} loaded.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chip("succeeded last time", ok.length, "bg-good/10 text-good")}
          {chip("failed last time", bad.length, bad.length ? "bg-bad/10 text-bad" : "bg-white/5 text-mute")}
          {chip("running now", running.length, running.length ? "bg-brand/10 text-brand" : "bg-white/5 text-mute")}
          {none.length > 0 && chip("never run", none.length, "bg-white/5 text-mute")}
        </div>
      )}
      {bad.length > 0 && <p className="sub">Failed last time: {bad.map((j) => j.title).join(", ")}. A failed deploy is often GitHub being slow; open the card to see the run.</p>}
    </Card>
  );
}

export default function Jobs() {
  return (
    <div className="space-y-6">
      <Summary />
      {GROUPS.map((g) => (
        <section key={g} aria-label={g}>
          <h2 className="h2 mb-3">{g}</h2>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {JOBS.filter((j) => j.group === g).map((j) => (j.worker ? <WorkerJobCard key={j.id} job={j} /> : j.external ? (j.id === "reindex" ? <ReindexCard key={j.id} job={j} /> : <ExternalJobCard key={j.id} job={j} />) : <JobCard key={j.id} job={j} />))}
          </div>
        </section>
      ))}
      <p className="sub">Status comes straight from GitHub and updates while a job is running. Posting jobs are status only, so nobody can publish by accident from here. The cooldowns protect Google&apos;s daily limits and are enforced by the server, not this page.</p>
    </div>
  );
}
