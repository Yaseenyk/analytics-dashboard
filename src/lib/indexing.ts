import type { HealthSite } from "./types";

/** A sitemap page Google has not looked at yet. That is not a verdict, so it is not counted as "not indexed". */
export const isWaiting = (state: string) => /new page|not checked yet/i.test(state);
/** A page that tells Google not to list it. Deliberate (for example the translated solar pages), so it is not a problem to fix. */
export const isOnPurpose = (state: string) => /noindex/i.test(state);
/** A real "not indexed": Google knows the page (or looked and said no) and has not added it. */
export const isReal = (state: string) => !isWaiting(state) && !isOnPurpose(state);

export interface IndexSplit {
  indexed: number;
  /** Google looked, or knows the page, and has not indexed it. This is the number to act on. */
  real: number;
  /** New pages Google has not checked yet. */
  waiting: number;
  /** Pages that say noindex on purpose. */
  onPurpose: number;
  checked: number;
}

/** Counts from the full per-state totals, never from the shortened URL list, so the number is complete. */
export function splitIndex(s: HealthSite | undefined): IndexSplit {
  const out: IndexSplit = { indexed: 0, real: 0, waiting: 0, onPurpose: 0, checked: 0 };
  if (!s) return out;
  out.indexed = s.indexed;
  out.checked = s.inspected;
  for (const [state, count] of Object.entries(s.byState ?? {})) {
    if (isOnPurpose(state)) out.onPurpose += count;
    else if (isWaiting(state)) out.waiting += count;
  }
  // Everything checked that is not indexed, waiting or deliberate is a real "not indexed".
  out.real = Math.max(0, s.inspected - s.indexed - out.onPurpose - out.waiting);
  return out;
}

export function splitAll(list: (HealthSite | undefined)[]): IndexSplit {
  return list.reduce<IndexSplit>((a, s) => {
    const x = splitIndex(s);
    return { indexed: a.indexed + x.indexed, real: a.real + x.real, waiting: a.waiting + x.waiting, onPurpose: a.onPurpose + x.onPurpose, checked: a.checked + x.checked };
  }, { indexed: 0, real: 0, waiting: 0, onPurpose: 0, checked: 0 });
}
