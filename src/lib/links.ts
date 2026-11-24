import { SITES } from "./config";
import type { LinksFile } from "./types";

/** Why a site has no numbers: Bing found nothing, the site is not in Bing, Bing failed, or the run skipped it. */
export type LinkState = "ok" | "none" | "unverified" | "error";
export interface LinkRow {
  h: string;
  name: string;
  state: LinkState;
  domains: number;
  links: number;
  /** null when there is no snapshot from about a week ago to compare with. */
  fresh: number | null;
  lost: number | null;
  partial: boolean;
  why?: string;
}
export const STATE_TEXT: Record<Exclude<LinkState, "ok">, string> = {
  none: "Bing has not found links to this site yet",
  unverified: "Site not verified in Bing",
  error: "Bing could not be read for this site",
};

const hosts = (site: string) => (site === "all" ? Object.keys(SITES) : [site]);

/** One row per site, sites with linking domains first (most first), then the empty ones in a fixed order. */
export function linkRows(f: LinksFile | null | undefined, site: string): LinkRow[] {
  if (!f) return [];
  const verified = new Set(f.verified ?? []);
  const knowsSites = Array.isArray(f.verified);
  const rows = hosts(site).map((h): LinkRow => {
    const s = f.sites?.[h];
    const w = f.week?.[h];
    const base = { h, name: SITES[h] ?? h, domains: 0, links: 0, fresh: w ? w.new.length : null, lost: w ? w.lost.length : null, partial: false };
    if (!s) {
      // No list of Bing's sites at all means the whole call failed, so "not verified" would be a guess.
      const state: LinkState = !knowsSites ? "error" : verified.has(h) ? "error" : "unverified";
      return { ...base, state, why: state === "error" ? f.error ?? undefined : undefined };
    }
    if (s.status !== "ok") return { ...base, state: "error", why: s.error };
    const domains = s.domains?.length ?? 0;
    const links = s.links ?? 0;
    return { ...base, state: domains || links ? "ok" : "none", domains, links, partial: !!s.partial };
  });
  const order = { ok: 0, none: 1, error: 2, unverified: 3 } as const;
  return rows.sort((a, b) => order[a.state] - order[b.state] || b.domains - a.domains || b.links - a.links || a.name.localeCompare(b.name));
}

export interface LinkTotals {
  domains: number;
  links: number;
  fresh: number;
  lost: number;
  sites: number;
  compared: boolean;
}
/** Totals over the rows. A domain linking to two sites counts once per site (each site's own list). */
export function linkTotals(rows: LinkRow[]): LinkTotals {
  return rows.reduce<LinkTotals>(
    (a, r) => ({
      domains: a.domains + r.domains,
      links: a.links + r.links,
      fresh: a.fresh + (r.fresh ?? 0),
      lost: a.lost + (r.lost ?? 0),
      sites: a.sites + (r.state === "ok" ? 1 : 0),
      compared: a.compared || r.fresh !== null,
    }),
    { domains: 0, links: 0, fresh: 0, lost: 0, sites: 0, compared: false },
  );
}

export interface NewLink {
  h: string;
  name: string;
  domain: string;
  from: string;
  to: string;
}
/** "our page" as a short path: https://x.com/blog/a -> /blog/a */
export const pathOf = (u: string) => {
  try {
    const p = new URL(u);
    return p.pathname + p.search || "/";
  } catch {
    return u;
  }
};
/** Safe external link: only http(s) URLs are turned into links. */
export const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

export function newLinks(f: LinksFile | null | undefined, site: string): NewLink[] {
  if (!f?.week) return [];
  return hosts(site)
    .flatMap((h) => (f.week?.[h]?.new ?? []).map(([domain, from, to]) => ({ h, name: SITES[h] ?? h, domain, from, to })))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}
export function lostLinks(f: LinksFile | null | undefined, site: string): { h: string; name: string; domain: string }[] {
  if (!f?.week) return [];
  return hosts(site)
    .flatMap((h) => (f.week?.[h]?.lost ?? []).map((domain) => ({ h, name: SITES[h] ?? h, domain })))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** For one site: its top linking domains and top linked pages, as [label, value] for bar lists. */
export function siteTop(f: LinksFile | null | undefined, site: string, max = 8): { domains: [string, number][]; pages: [string, number][] } {
  const s = site === "all" ? undefined : f?.sites?.[site];
  if (!s || s.status !== "ok") return { domains: [], pages: [] };
  return { domains: (s.domains ?? []).slice(0, max), pages: (s.pages ?? []).slice(0, max).map(([u, c]) => [pathOf(u), c]) };
}

/** The date a first week-over-week comparison can appear, from the oldest snapshot kept. */
export function firstCompare(f: LinksFile | null | undefined): string | null {
  const first = f?.history?.map((x) => x.date).sort()[0];
  if (!first) return null;
  return new Date(Date.parse(first) + 7 * 864e5).toISOString().slice(0, 10);
}
