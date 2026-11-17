import type { GSCFile, HistoryRow } from "./types";

/** One thing we changed on purpose. Kept in data/changes.json, newest last. Add a line every time something is changed. */
export interface Change {
  id: string;
  /** The day it went live, YYYY-MM-DD. */
  date: string;
  title: string;
  kind: "indexing" | "content" | "technical" | "quality" | "new-content";
  hosts: string[];
  detail: string;
  expect: string;
}
export interface ChangesFile {
  generatedAt: string;
  /** While today is before this date nothing on the sites is edited; only scheduled posts publish. */
  freezeUntil: string | null;
  freezeNote: string;
  changes: Change[];
}

export type Verdict = "helped" | "hurt" | "no-effect" | "too-early";
export type Stage = "too-early" | "early" | "final";
export interface Reading {
  change: Change;
  /** Whole days between the change and the newest Search Console day. */
  days: number;
  stage: Stage;
  verdict: Verdict;
  idxAt: number | null;
  idxNow: number | null;
  clicksBefore: number;
  clicksAfter: number;
  imprBefore: number;
  imprAfter: number;
  why: string;
  overlaps: string[];
}

const DAY = 864e5;
const BEFORE_DAYS = 14;
const MAX_AFTER = 28;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const prop = (host: string) => `https://${host}/`;

/** Sum of [date, clicks, impressions] rows across the hosts, inside [from, to] inclusive. */
function window(g: GSCFile | null | undefined, hosts: string[], from: number, to: number) {
  let clicks = 0;
  let impr = 0;
  for (const h of hosts) {
    const rows = (g?.search?.[prop(h)]?.daily ?? []) as (string | number)[][];
    for (const r of rows) {
      const t = day(String(r[0]));
      if (t >= from && t <= to) { clicks += +r[1] || 0; impr += +r[2] || 0; }
    }
  }
  return { clicks, impr };
}
function indexedAt(hist: HistoryRow[], hosts: string[], onOrBefore: number): number | null {
  let row: HistoryRow | undefined;
  for (const r of hist) if (day(r.d) <= onOrBefore && (!row || r.d > row.d)) row = r;
  if (!row) return null;
  return hosts.reduce((a, h) => a + (row!.sites[h]?.[0] ?? 0), 0);
}
const rate = (n: number, days: number) => (days > 0 ? n / days : 0);
const fix = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));

/** Reads what happened after each change. A reading, not proof: other changes and Google's own moods land in the same weeks. */
export function readChanges(file: ChangesFile, g: GSCFile | null | undefined, hist: HistoryRow[], today = iso(Date.now())): Reading[] {
  const last = (() => {
    let m = 0;
    for (const s of Object.values(g?.search ?? {})) for (const r of (s.daily ?? []) as (string | number)[][]) m = Math.max(m, day(String(r[0])));
    return m || day(today);
  })();
  return file.changes.map((c) => {
    const at = day(c.date);
    const days = Math.max(0, Math.round((last - at) / DAY));
    const stage: Stage = days < 7 ? "too-early" : days < 21 ? "early" : "final";
    const afterEnd = Math.min(last, at + MAX_AFTER * DAY);
    const afterDays = Math.max(0, Math.round((afterEnd - at) / DAY));
    const b = window(g, c.hosts, at - BEFORE_DAYS * DAY, at - DAY);
    const a = window(g, c.hosts, at + DAY, afterEnd);
    const idxAt = indexedAt(hist, c.hosts, at);
    const idxNow = indexedAt(hist, c.hosts, day(today));
    const idxDelta = idxAt !== null && idxNow !== null ? idxNow - idxAt : null;
    const cb = rate(b.clicks, BEFORE_DAYS), ca = rate(a.clicks, afterDays);
    const ib = rate(b.impr, BEFORE_DAYS), ia = rate(a.impr, afterDays);
    const overlaps = file.changes.filter((o) => o.id !== c.id && o.hosts.some((h) => c.hosts.includes(h)) && Math.abs(day(o.date) - at) <= 7 * DAY).map((o) => o.title);

    const hurtIdx = idxDelta !== null && idxDelta <= -2;
    const helpIdx = idxDelta !== null && idxDelta >= 2;
    const hurtClicks = b.clicks >= 5 && ca <= cb * 0.6;
    const helpImpr = b.impr >= 20 && ia >= ib * 1.25 && ca >= cb * 0.9;
    let verdict: Verdict = "no-effect";
    if (stage === "too-early") verdict = "too-early";
    else if ((hurtIdx || hurtClicks) && !(helpIdx || helpImpr)) verdict = "hurt";
    else if ((helpIdx || helpImpr) && !(hurtIdx || hurtClicks)) verdict = "helped";

    const bits = [
      idxDelta !== null ? `Pages in Google ${idxAt} to ${idxNow} (${idxDelta >= 0 ? "+" : ""}${idxDelta}).` : "",
      `Clicks a day ${fix(cb)} to ${fix(ca)}.`,
      `Impressions a day ${fix(ib)} to ${fix(ia)}.`,
    ].filter(Boolean);
    const why = stage === "too-early" ? `Only ${days} day${days === 1 ? "" : "s"} of data after the change. A reading starts at 7 days.` : bits.join(" ");
    return { change: c, days, stage, verdict, idxAt, idxNow, clicksBefore: cb, clicksAfter: ca, imprBefore: ib, imprAfter: ia, why, overlaps };
  });
}
