// Who links to the sites, from the free Bing Webmaster Tools API (no paid tools). Called by scripts/build.mjs only on the daily
// scheduled run (or a manual run), never on page load and never on a push.
//   GetLinkCounts(siteUrl, page)       pages of this site that have inbound links, with a count each (zero-based paging)
//   GetUrlLinks(siteUrl, link, page)   the linking URLs (and anchor text) for one of those pages (zero-based paging)
// Bing sees fewer links than paid tools, and only the top linked pages are opened, so the domain list is a floor, not complete.
// Output: public/data/links.json with today's snapshot, a small history of linking domains (one entry per day, 15 kept) and
// the new and lost domains against the snapshot from about 7 days earlier. public/data is not committed, so the history is
// carried forward from the copy published last time.

export const LIMITS = {
  countPages: 5, // GetLinkCounts pages per site
  topPages: 10, // most-linked pages per site whose linking URLs are read
  linkPages: 2, // GetUrlLinks pages per top page
  calls: 260, // all link calls in one run, every site together
  keepPages: 20, // top linked pages kept per site
  keepDomains: 200, // linking domains kept per site
  history: 15, // daily snapshots kept
};
const OWN = /(^|\.)streamerosai\.com$/;

/** "https://www.Example.com/a" -> "example.com". Anything that is not a URL gives "". */
export function domainOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
/** A link from one of our own sites (cross-links between subdomains) is not a backlink. */
export const isOwn = (domain) => OWN.test(domain);

const isQuota = (r) => r.status === 429 || /throttl|quota|exceed|too many/i.test(String(r.detail || ''));
const objOf = (r) => (r && Array.isArray(r.rows) && r.rows[0] && typeof r.rows[0] === 'object' ? r.rows[0] : {});

/**
 * Pure aggregation for one site. counts: [{ Url, Count }] from GetLinkCounts; details: { [myPageUrl]: [{ Url, AnchorText }] }
 * from GetUrlLinks. Returns totals, top pages, linking domains (own sites left out) and one example link per domain.
 */
export function summarizeSite(counts, details, partial = false) {
  const pages = (counts || [])
    .filter((x) => x && x.Url)
    .map((x) => [String(x.Url), Math.max(0, +x.Count || 0)])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const links = pages.reduce((s, p) => s + p[1], 0);
  const dom = new Map();
  for (const [page, rows] of Object.entries(details || {})) {
    for (const r of rows || []) {
      const d = domainOf(r && r.Url);
      if (!d || isOwn(d)) continue;
      const o = dom.get(d) || { n: 0, from: String(r.Url), to: page };
      o.n += 1;
      dom.set(d, o);
    }
  }
  const domains = [...dom.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1)).slice(0, LIMITS.keepDomains);
  return {
    status: 'ok',
    links,
    pagesWithLinks: pages.length,
    partial: !!partial,
    pages: pages.slice(0, LIMITS.keepPages),
    domains: domains.map(([d, o]) => [d, o.n]),
    examples: Object.fromEntries(domains.map(([d, o]) => [d, [o.from, o.to]])),
  };
}

/**
 * Fetch one site's links with the shared call budget. get(method, params) -> { status, rows, detail } (build.mjs's bingGet).
 * A failure on the first call marks the site as an error and the run moves on; a quota answer stops every later link call.
 */
export async function fetchSiteLinks(get, siteUrl, budget, pause = async () => {}) {
  const call = async (method, params) => {
    if (budget.left <= 0) return null;
    budget.left -= 1;
    const r = await get(method, { siteUrl, ...params });
    await pause();
    if (r.status !== 200 && isQuota(r)) {
      budget.left = 0;
      budget.stopped = 'Bing said the daily API quota was used up';
    }
    // A Bing that stops answering (timeouts) must not hold the build: three in a row end the link calls for this run.
    budget.timeouts = r.status === 599 ? (budget.timeouts || 0) + 1 : 0;
    if (budget.timeouts >= 3) {
      budget.left = 0;
      budget.stopped = budget.stopped || 'Bing stopped answering';
    }
    return r;
  };
  let partial = false;
  const counts = [];
  for (let page = 0; page < LIMITS.countPages; page++) {
    const r = await call('GetLinkCounts', { page: String(page) });
    if (!r) { partial = true; break; }
    if (r.status !== 200) {
      if (page === 0) return { status: 'error', error: `Bing returned ${r.status}${r.detail ? `: ${String(r.detail).slice(0, 120)}` : ''}` };
      partial = true;
      break;
    }
    const o = objOf(r);
    counts.push(...(Array.isArray(o.Links) ? o.Links : []));
    const total = +o.TotalPages || 0;
    if (page + 1 >= total) break;
    if (page + 1 >= LIMITS.countPages) partial = true;
  }
  const top = counts.filter((x) => x && x.Url).sort((a, b) => (+b.Count || 0) - (+a.Count || 0)).slice(0, LIMITS.topPages);
  if (counts.filter((x) => x && x.Url).length > top.length) partial = true;
  const details = {};
  for (const p of top) {
    const rows = [];
    for (let page = 0; page < LIMITS.linkPages; page++) {
      const r = await call('GetUrlLinks', { link: String(p.Url), page: String(page) });
      if (!r) { partial = true; break; }
      if (r.status !== 200) { partial = true; break; }
      const o = objOf(r);
      rows.push(...(Array.isArray(o.Details) ? o.Details : []));
      const total = +o.TotalPages || 0;
      if (page + 1 >= total) break;
      if (page + 1 >= LIMITS.linkPages) partial = true;
    }
    details[String(p.Url)] = rows;
  }
  return summarizeSite(counts, details, partial);
}

/**
 * Every site Bing lists for the key. sites: GetUserSites rows ({ Url, IsVerified }). Unverified sites are recorded, not called.
 * One site failing never stops the others.
 */
export async function fetchAllLinks(get, sites, pause = async () => {}) {
  const budget = { left: LIMITS.calls, stopped: null };
  const out = {};
  const verified = [];
  const unverified = [];
  for (const s of sites || []) {
    const host = domainOf(s && s.Url) ? new URL(s.Url).hostname.toLowerCase() : '';
    if (!host) continue;
    if (s.IsVerified === false) { unverified.push(host); continue; }
    verified.push(host);
    if (budget.left <= 0) { out[host] = { status: 'skipped', error: budget.stopped || 'The run reached its call limit before this site' }; continue; }
    try {
      out[host] = await fetchSiteLinks(get, s.Url, budget, pause);
    } catch (e) {
      out[host] = { status: 'error', error: String((e && e.message) || e).slice(0, 160) };
    }
  }
  return { sites: out, verified, unverified, stopped: budget.stopped, calls: LIMITS.calls - budget.left };
}

const dayMs = 864e5;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/** The snapshot to compare with: the newest one at least 7 days old, else the oldest one before today, else none. */
export function pickBaseline(history, today, days = 7) {
  const list = (history || []).filter((h) => h && h.date && h.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return null;
  const target = isoDay(Date.parse(today) - days * dayMs);
  const old = list.filter((h) => h.date <= target);
  return old.length ? old[old.length - 1] : list[0];
}

/** New and lost linking domains for one site. New entries carry the example link: [domain, linking URL, our page]. */
export function diffDomains(site, before) {
  if (!site || site.status !== 'ok' || !Array.isArray(before)) return null;
  const was = new Set(before);
  const now = new Set((site.domains || []).map((d) => d[0]));
  const ex = site.examples || {};
  return {
    new: [...now].filter((d) => !was.has(d)).map((d) => [d, ex[d]?.[0] || '', ex[d]?.[1] || '']),
    lost: [...was].filter((d) => !now.has(d)).sort(),
  };
}

/**
 * Put today's fetch, the history carried from the published copy and the week-over-week diff into one file.
 * fetched: fetchAllLinks() result, or null when Bing could not be read at all (then the old snapshot is kept with the error).
 */
export function buildLinksFile({ fetched, prev, error, now = new Date() }) {
  const generatedAt = new Date(now).toISOString();
  const today = generatedAt.slice(0, 10);
  const history = (Array.isArray(prev?.history) ? prev.history : []).filter((h) => h && typeof h.date === 'string' && h.sites);
  if (!fetched) {
    return {
      ...(prev || { sites: {}, week: {}, history: [] }),
      source: 'bing',
      error: error || 'Bing could not be read',
      checkedAt: generatedAt,
      generatedAt: prev?.generatedAt || generatedAt,
    };
  }
  const snap = {};
  for (const [h, s] of Object.entries(fetched.sites)) if (s.status === 'ok') snap[h] = s.domains.map((d) => d[0]);
  const kept = history.filter((x) => x.date !== today);
  const base = pickBaseline(kept, today);
  const week = {};
  for (const [h, s] of Object.entries(fetched.sites)) {
    const d = base ? diffDomains(s, base.sites[h]) : null;
    if (d) week[h] = { since: base.date, ...d };
  }
  const nextHistory = [...kept, { date: today, sites: snap }].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-LIMITS.history);
  return {
    generatedAt,
    source: 'bing',
    error: error || fetched.stopped || null,
    limits: { topPages: LIMITS.topPages, linkPages: LIMITS.linkPages, countPages: LIMITS.countPages },
    calls: fetched.calls,
    verified: fetched.verified,
    unverified: fetched.unverified,
    sites: fetched.sites,
    since: base ? base.date : null,
    week,
    history: nextHistory,
  };
}
