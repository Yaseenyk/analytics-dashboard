import type { HealthFile } from "./types";

/** Pages you copied for Search Console, kept in the browser: url -> when it was copied and which site it belongs to. */
export type Review = Record<string, { at: string; host: string }>;

export interface ReviewView {
  /** Per site, the not-indexed pages that have not been copied yet. */
  notIn: { host: string; rows: [string, string, string | null][] }[];
  /** Copied pages Google has not indexed yet (or has no fresh answer for), oldest first. */
  under: { url: string; host: string; at: string; status: string }[];
  /** Copied pages that Google now reports as indexed. */
  done: { url: string; host: string; at: string }[];
  /** True once the health file carries the indexed list (older files do not, so nothing can be marked indexed yet). */
  hasIdx: boolean;
}

export function buildReview(h: HealthFile, hosts: string[], rev: Review): ReviewView {
  const notIn: ReviewView["notIn"] = [];
  const under: ReviewView["under"] = [];
  const done: ReviewView["done"] = [];
  const known = new Map<string, { status: string; indexed: boolean }>();
  hosts.forEach((host) => {
    const s = h.index?.[host];
    if (!s) return;
    s.urls.forEach((u) => known.set(u[0], { status: u[1], indexed: false }));
    (s.indexedUrls ?? []).forEach((u) => known.set(u, { status: "Indexed", indexed: true }));
    notIn.push({ host, rows: s.urls.filter((u) => !rev[u[0]]) });
  });
  Object.entries(rev).forEach(([url, r]) => {
    if (!hosts.includes(r.host)) return;
    const k = known.get(url);
    if (k?.indexed) done.push({ url, host: r.host, at: r.at });
    else under.push({ url, host: r.host, at: r.at, status: k?.status ?? "Waiting for the next check" });
  });
  under.sort((a, b) => a.at.localeCompare(b.at));
  return { notIn, under, done, hasIdx: hosts.some((x) => !!h.index?.[x]?.indexedUrls) };
}
