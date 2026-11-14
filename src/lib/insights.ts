import { SITES, SITE_HOSTS } from "./config";
import { gscDaily, gscTotals, hasGA } from "./derive";
import { metricByHost } from "./today";
import type { AlertItem, GAFile, GSCFile } from "./types";

/* ---------------------------------------------------------------- real visitors */

export interface BotRow {
  host: string;
  sessions: number;
  engaged: number;
  actions: number;
  /** Share of visits that were engaged (10 seconds, 2 pages or a key action). Bots usually load one page and leave. */
  rate: number;
  actionRate: number;
  suspect: boolean;
}
/** Visits, engaged visits and actions per site. A site with plenty of visits and almost none engaged is probably bots. */
export function botCheck(ga: GAFile | null | undefined, site: string): BotRow[] {
  if (!ga || !hasGA(ga)) return [];
  const s = metricByHost(ga, "sessions"), e = metricByHost(ga, "engagedSessions"), k = metricByHost(ga, "keyEvents");
  const hosts = site === "all" ? SITE_HOSTS : [site];
  return hosts
    .filter((h) => (s[h] ?? 0) > 0)
    .map((h) => {
      const sessions = s[h] ?? 0, engaged = e[h] ?? 0, actions = k[h] ?? 0;
      const rate = sessions ? engaged / sessions : 0;
      return { host: h, sessions, engaged, actions, rate, actionRate: sessions ? actions / sessions : 0, suspect: sessions >= 30 && rate < 0.15 };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/* ---------------------------------------------------------------- what changed */

export interface Change { date: string; host: string; text: string }
/**
 * Things we shipped that could move search numbers, newest first. Add a line whenever a change goes live (real dates only):
 * the "What changed" sheet compares the week before with the days after.
 */
export const CHANGES: Change[] = [
  { date: "2026-11-13", host: "solar.streamerosai.com", text: "All 13 languages opened to Google" },
  { date: "2026-11-10", host: "solar.streamerosai.com", text: "Hindi, Marathi and Gujarati opened to Google" },
  { date: "2026-11-05", host: "streamerosai.com", text: "OBS posts: titles and descriptions rewritten" },
];

export interface Effect {
  change: Change;
  state: "ok" | "early" | "outside" | "none";
  before: { clicks: number; impr: number; days: number };
  after: { clicks: number; impr: number; days: number };
}
const addDays = (d: string, k: number) => new Date(Date.parse(d + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10);
/** Average daily clicks and impressions for the 7 days before a change against the days since (Google lags 2 to 3 days). */
export function effects(g: GSCFile | null | undefined, changes: Change[] = CHANGES): Effect[] {
  return changes.map((change) => {
    const rows = gscDaily(g, change.host);
    const avg = (from: string, to: string) => {
      const r = rows.filter((x) => x.d >= from && x.d <= to);
      return { clicks: r.reduce((t, x) => t + x.clicks, 0), impr: r.reduce((t, x) => t + x.impr, 0), days: r.length };
    };
    const before = avg(addDays(change.date, -7), addDays(change.date, -1));
    const after = avg(change.date, addDays(change.date, 6));
    const empty = { clicks: 0, impr: 0, days: 0 };
    if (!rows.length || (!before.days && !after.days)) return { change, state: "outside", before: empty, after: empty };
    if (after.days < 3 || before.days < 3) return { change, state: "early", before, after };
    return { change, state: "ok", before, after };
  });
}

/* ---------------------------------------------------------------- alerts worked out in the page */

/** Warnings that need no nightly job: old or missing numbers, a fall in Google clicks, traffic that looks like bots. */
export function localAlerts(ga: GAFile | null | undefined, gsc: GSCFile | null | undefined, now = Date.now()): AlertItem[] {
  const out: AlertItem[] = [];
  // Dated by the numbers they are about, not by "now": otherwise every page load would make them look brand new.
  const at = ga?.generatedAt ?? gsc?.generatedAt ?? new Date(now).toISOString();
  if ((ga as { idle?: boolean } | null | undefined)?.idle || ga?.down) out.push({ id: "local-ga-missing", kind: "local", level: "warn", title: "Google Analytics numbers are missing", detail: "Tap Refresh under Google Analytics to load them. They are kept after that.", at });
  else if (ga?.staleSince) out.push({ id: "local-ga-stale", kind: "local", level: "warn", title: "Google Analytics numbers are old", detail: `Google did not answer the last refresh, so these are from ${ga.staleSince.slice(0, 16).replace("T", " ")} UTC.`, at });
  else if (ga?.generatedAt && now - Date.parse(ga.generatedAt) > 2 * 86400e3) out.push({ id: "local-ga-old", kind: "local", level: "warn", title: "Google Analytics numbers are more than 2 days old", detail: "Tap Refresh under Google Analytics to load fresh ones.", at });
  if (gsc) {
    const a = gscTotals(gsc, "all", false), b = gscTotals(gsc, "all", true);
    if (b.clicks >= 20 && a.clicks < b.clicks * 0.6) out.push({ id: "local-clicks-drop", kind: "local", level: "bad", title: "Google clicks fell sharply", detail: `${a.clicks} clicks against ${b.clicks} in the period before (down ${Math.round((100 * (b.clicks - a.clicks)) / b.clicks)}%). Check the Search Console tab and the Not indexed list.`, at });
  }
  botCheck(ga, "all").filter((r) => r.sessions >= 100 && r.rate < 0.1).slice(0, 3).forEach((r) =>
    out.push({ id: `local-bots-${r.host}`, kind: "local", level: "warn", title: `Very few engaged visits on ${SITES[r.host] ?? r.host}`, detail: `${r.engaged} of ${r.sessions} visits in this period (${Math.round(100 * r.rate)}%) stayed 10 seconds, opened a second page or took an action. This can be bots, or real visitors who leave fast; it is not proof of bots.`, at }));
  return out;
}
