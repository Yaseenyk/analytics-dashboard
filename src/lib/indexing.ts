import type { HealthSite, QueueRec } from "./types";

/** A sitemap page Google has not looked at yet. That is not a verdict, so it is not counted as "not indexed". */
export const isWaiting = (state: string) => /new page|not checked yet/i.test(state);
/** A page that tells Google not to list it. Deliberate (for example the translated solar pages), so it is not a problem to fix. */
export const isOnPurpose = (state: string) => /noindex/i.test(state);
/** The daily check could not get an answer from Google for this page (API error or timeout). Says nothing about the page. */
export const isFailed = (state: string) => /could not inspect/i.test(state);
/** A real "not indexed": Google knows the page (or looked and said no) and has not added it. */
export const isReal = (state: string) => !isWaiting(state) && !isOnPurpose(state) && !isFailed(state);

export interface IndexSplit {
  indexed: number;
  /** Google looked, or knows the page, and has not indexed it. This is the number to act on. */
  real: number;
  /** New pages Google has not checked yet. */
  waiting: number;
  /** Pages that say noindex on purpose. */
  onPurpose: number;
  /** Pages the last check could not get an answer for from Google. */
  failed: number;
  checked: number;
}

/** Counts from the full per-state totals, never from the shortened URL list, so the number is complete. */
export function splitIndex(s: HealthSite | undefined): IndexSplit {
  const out: IndexSplit = { indexed: 0, real: 0, waiting: 0, onPurpose: 0, failed: 0, checked: 0 };
  if (!s) return out;
  out.indexed = s.indexed;
  out.checked = s.inspected;
  for (const [state, count] of Object.entries(s.byState ?? {})) {
    if (isOnPurpose(state)) out.onPurpose += count;
    else if (isWaiting(state)) out.waiting += count;
    else if (isFailed(state)) out.failed += count;
  }
  // Everything checked that is not indexed, waiting, deliberate or a failed check is a real "not indexed".
  out.real = Math.max(0, s.inspected - s.indexed - out.onPurpose - out.waiting - out.failed);
  return out;
}

export function splitAll(list: (HealthSite | undefined)[]): IndexSplit {
  return list.reduce<IndexSplit>((a, s) => {
    const x = splitIndex(s);
    return { indexed: a.indexed + x.indexed, real: a.real + x.real, waiting: a.waiting + x.waiting, onPurpose: a.onPurpose + x.onPurpose, failed: a.failed + x.failed, checked: a.checked + x.checked };
  }, { indexed: 0, real: 0, waiting: 0, onPurpose: 0, failed: 0, checked: 0 });
}

export type Priority = "high" | "medium" | "low";
export interface PriorityInfo { level: Priority; reason: string }

const LANG = /^\/[a-z]{2}(-[a-z]{2,4})?\//i; // /hi/..., /zh/..., /pt-br/...
const THIN = /^\/(tag|tags|category|categories|author|page|search|archive)\//i;
const CONTENT = /^\/(blog|guides|posts|articles|final-year-projects|projects)\//i; // pages people write on purpose
const KEY = /^\/(products?|hire|about|projects?|services?|solutions?|pricing|download|contact|interview)(\/|$)/i;

/**
 * How much a page that is not in Google is worth fixing first.
 * High: it already has search demand (impressions), is a key page, or Google read it and said no (a quality signal to act on).
 * Medium: a normal content page Google has found but not crawled.
 * Low: a translated copy, a list or tag page, or a page nobody has asked for.
 */
export function priorityOf(url: string, state: string, impressions: number): PriorityInfo {
  const p = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  if (impressions >= 20) return { level: "high", reason: `Has ${impressions.toLocaleString("en-US")} Google impressions: people are asking for it` };
  if (p === "/" || KEY.test(p)) return { level: "high", reason: "A key page of the site" };
  if (THIN.test(p)) return { level: "low", reason: "A list or tag page" };
  if (LANG.test(p)) return { level: "low", reason: "A translated copy" };
  if (/crawled/i.test(state)) return { level: "high", reason: "Google read it and chose not to keep it: improve the page" };
  if (/discovered/i.test(state)) return { level: "medium", reason: "Google found it but has not crawled it yet: link to it from other pages" };
  if (impressions > 0) return { level: "medium", reason: `Has ${impressions} impression${impressions === 1 ? "" : "s"}` };
  if (/unknown/i.test(state) && CONTENT.test(p)) return { level: "medium", reason: "A content page Google has not seen yet: request indexing and link to it from another page" };
  return { level: "low", reason: "Google does not know it yet and nobody searched for it" };
}
export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export interface SiteTrend { now: number; then: number; delta: number; days: number }
/** How a site's count of pages in Google moved over the last `span` days of the daily index check (or since the first check, when the history is shorter). */
export function siteTrend(hist: { d: string; sites: Record<string, [number, number]> }[] | null | undefined, host: string, span = 7): SiteTrend | null {
  const rows = (hist ?? []).filter((r) => r.sites[host]).sort((a, b) => a.d.localeCompare(b.d));
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1]!;
  const end = Date.parse(`${last.d}T00:00:00Z`);
  const first = rows.find((r) => end - Date.parse(`${r.d}T00:00:00Z`) <= span * 864e5)!;
  const days = Math.round((end - Date.parse(`${first.d}T00:00:00Z`)) / 864e5);
  if (days < 1) return null;
  const now = last.sites[host]![0], then = first.sites[host]![0];
  return { now, then, delta: now - then, days };
}

/** How long a page you sent to Search Console may stay out of Google before it counts as needing another look. */
export const WAIT_DAYS = 14;
export interface LedgerFlags {
  /** The Worker saw this page in Google and then not: it goes back to the top. */
  dropped: boolean;
  dropDate: string | null;
  drops: number;
  /** Days since you sent it, while that is still inside the waiting time. */
  asked: number | null;
  /** Days since you sent it, once the waiting time has passed and Google still has not taken it. */
  stillOut: number | null;
  /** True when the page dropped after you sent it, so the old "sent" mark no longer means anything. */
  sentIsStale: boolean;
}
/** Joins the Worker's ledger entry for a page with when you sent it (kept in this browser). */
export function ledgerFlags(rec: QueueRec | undefined, sentAt: string | undefined, now = Date.now()): LedgerFlags {
  const dropDate = rec?.droppedAt ?? null;
  const sentIsStale = !!(sentAt && dropDate && Date.parse(dropDate) > Date.parse(sentAt));
  const days = sentAt && !sentIsStale ? Math.max(0, Math.floor((now - Date.parse(sentAt)) / 864e5)) : null;
  return {
    dropped: !!dropDate,
    dropDate,
    drops: rec?.drops ?? 0,
    asked: days !== null && days < WAIT_DAYS ? days : null,
    stillOut: days !== null && days >= WAIT_DAYS ? days : null,
    sentIsStale,
  };
}
