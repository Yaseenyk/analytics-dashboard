"use client";

import { SITES, SITE_HOSTS } from "@/lib/config";
import { useClarity } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import type { ClaritySignal } from "@/lib/types";
import { Card, SkTable } from "@/components/ui";

const pct = (s: ClaritySignal | null) => (s && s.pct !== null ? `${s.pct.toFixed(1)}%` : "–");
const num = (v: number | null, d = 0) => (v === null ? "–" : v.toFixed(d));
const mins = (v: number | null) => (v === null ? "–" : v >= 60 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${Math.round(v)}s`);
/** More than 5% of sessions with a frustration signal is worth a look; the colour only marks that. */
const warn = (s: ClaritySignal | null) => (s && s.pct !== null && s.pct > 5 ? "text-bad" : "text-ink");

/** Behaviour from Microsoft Clarity: how people use each site, and where they get frustrated. Needs a Clarity API token per site. */
export function BehaviourCard() {
  const f = useFilters();
  const e = useClarity();
  if (e.error && !e.data) {
    return (
      <Card title="Behaviour (Microsoft Clarity)">
        <p className="sub">No Clarity data yet. Create an API token in each Clarity project (Settings, Data Export, Generate new API token) and add it to the CLARITY_TOKENS secret. The export then runs daily at 09:40 IST.</p>
      </Card>
    );
  }
  if (!e.data) return <SkTable />;
  const run = e.data.runs[e.data.runs.length - 1];
  if (!run) return null;
  const hosts = SITE_HOSTS.filter((h) => run.sites[h] && (f.site === "all" || f.site === h));
  if (!hosts.length) {
    return (
      <Card title="Behaviour (Microsoft Clarity)">
        <p className="sub">No Clarity data for this site yet. It needs an API token (see the Tools tab notes), and appears after the next daily export.</p>
      </Card>
    );
  }
  const missing = SITE_HOSTS.filter((h) => !run.sites[h]).map((h) => SITES[h]);
  return (
    <Card title="Behaviour (Microsoft Clarity)" note={`Last 3 days as of ${new Date(run.at).toLocaleDateString([], { day: "numeric", month: "short" })}. Clarity separates bots from people, so "People" here is sessions minus bot sessions. Red marks more than 5% of sessions with that frustration signal.`}>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-dim">
              {["Site", "People", "Bots", "Pages/visit", "Scroll depth", "Active time", "Rage clicks", "Dead clicks", "Quick backs", "Script errors"].map((c, i) => (
                <th key={c} scope="col" className={`py-2 font-medium ${i ? "px-2 text-right" : "pr-3"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => {
              const s = run.sites[h];
              return (
                <tr key={h} className="border-t border-line">
                  <td className="py-2.5 pr-3 font-medium">{SITES[h]}</td>
                  <td className="px-2 text-right font-mono">{num(s.humanSessions)}</td>
                  <td className="px-2 text-right font-mono text-mute">{num(s.botSessions)}</td>
                  <td className="px-2 text-right font-mono">{num(s.pagesPerSession, 1)}</td>
                  <td className="px-2 text-right font-mono">{s.scrollDepth === null ? "–" : `${s.scrollDepth.toFixed(0)}%`}</td>
                  <td className="px-2 text-right font-mono">{mins(s.activeSeconds)}</td>
                  <td className={`px-2 text-right font-mono ${warn(s.rageClicks)}`}>{pct(s.rageClicks)}</td>
                  <td className={`px-2 text-right font-mono ${warn(s.deadClicks)}`}>{pct(s.deadClicks)}</td>
                  <td className={`px-2 text-right font-mono ${warn(s.quickBacks)}`}>{pct(s.quickBacks)}</td>
                  <td className={`px-2 text-right font-mono ${warn(s.scriptErrors)}`}>{pct(s.scriptErrors)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && f.site === "all" && <p className="sub">Not connected yet: {missing.join(", ")}.</p>}
      {run.errors.length > 0 && <p className="sub text-bad">{run.errors.join("; ")}</p>}
    </Card>
  );
}
