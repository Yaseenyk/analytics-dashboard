import type { AlertItem, CrawlFile, HealthFile, Live } from "./types";
import { SITES, SITE_HOSTS, STREAMS } from "./config";

/**
 * Everything that needs a person (or is good to know), written like Search Console's "Why pages aren't indexed" list:
 * a reason, where it comes from, how many pages, and, when tapped, what it means and exactly what to do.
 */
export type Level = "bad" | "warn" | "info" | "good";
export type Source = "Google systems" | "Website" | "Automation" | "Dashboard";
export interface IssuePage { url: string; host: string; note?: string }
export interface Issue {
  id: string;
  level: Level;
  title: string;
  source: Source;
  /** How many pages (or jobs) are behind it. */
  count: number;
  /** What it means, in everyday words. */
  what: string;
  /** What to do, step by step. Empty for good news. */
  steps: string[];
  pages: IssuePage[];
  /** What the page rows offer: send to Google, just open, or nothing. */
  action: "inspect" | "open" | "none";
  /** Where to go for more. */
  link?: { href: string; label: string };
}

/** Search Console property that covers every subdomain of the sites. */
export const PROPERTY = "sc-domain:streamerosai.com";
/**
 * Where "Open in Search Console" goes: your site's page-indexing report, which has the "Inspect any URL" box at the top.
 * Search Console has no public address that pre-fills one page (its per-page links carry an internal id), so the page link is
 * copied to the clipboard at the same tap and the person pastes it into that box.
 */
export const inspectLink = (_url?: string) => `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(PROPERTY)}`;

/** Google's own status words in everyday language. */
export function plainState(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("discovered")) return "Google knows it exists but has not read it yet.";
  if (t.includes("crawled")) return "Google read it and chose not to keep it for now.";
  if (t.includes("unknown")) return "Google has never seen this page.";
  if (t.includes("duplicate")) return "Google thinks it copies another page.";
  if (t.includes("noindex")) return "The page tells Google not to list it.";
  if (t.includes("redirect")) return "The page sends people somewhere else.";
  if (t.includes("404") || t.includes("not found")) return "The page does not exist (404).";
  if (t.includes("not checked") || t.includes("not checked it")) return "Brand new. Google has not looked yet.";
  return s;
}

interface Help { match: RegExp; level: Level; source: Source; what: string; steps: string[]; action: Issue["action"] }
const SEND = "Tap “Open in Search Console” on a page. The page's link is copied for you and Search Console opens on your site. Paste the link into the box at the very top (“Inspect any URL”), press Enter, wait a few seconds, then tap REQUEST INDEXING.";
const HELP: Help[] = [
  { match: /unknown to google/i, level: "warn", source: "Google systems", action: "inspect", what: "Google has never seen these pages, so nobody can find them in search.",
    steps: ["Open one page below to check it loads and is not an error.", SEND, "Make sure another page on the same site links to it, so Google can find it on its own next time.", "Do about 10 a day. Google limits how many you can send."] },
  { match: /discovered/i, level: "warn", source: "Google systems", action: "inspect", what: "Google knows these pages exist but has not visited them yet. This usually fixes itself within days or weeks. Sending them can speed it up.",
    steps: [SEND, "Then wait. Google decides when to visit. Check back in a week."] },
  { match: /crawled/i, level: "warn", source: "Google systems", action: "inspect", what: "Google read these pages and decided not to keep them for now. This is usually because the page is short, looks like another page, or has little that is unique.",
    steps: ["Open a page and add something useful and unique: a clear answer near the top, 300+ words, a small example or table.", "Link to it from 2 or 3 of your other pages.", "After you improve it, send it again: " + SEND] },
  { match: /noindex/i, level: "info", source: "Website", action: "open", what: "These pages tell Google not to list them (a “noindex” tag). That is fine if you meant it, for example for private or test pages.",
    steps: ["If you meant to hide the page, do nothing.", "If you did not, the tag must be removed in the page's code. Ask Claude to remove noindex from that page, then send it to Google."] },
  { match: /redirect/i, level: "info", source: "Website", action: "open", what: "These addresses send people to another page, so Google keeps the other page instead. Old links that moved do this on purpose.",
    steps: ["Open the address. If it lands on the right new page, do nothing.", "If it lands somewhere wrong, fix where the link points or tell Claude."] },
  { match: /404|not found/i, level: "bad", source: "Website", action: "open", what: "These pages do not exist (error 404), so visitors and Google hit a dead end.",
    steps: ["Open the address to confirm it is broken.", "Either bring the page back, or remove the links that point to it and take it out of the sitemap. Tell Claude if you want this done."] },
  { match: /not checked it yet|new page/i, level: "info", source: "Google systems", action: "none", what: "These are brand new. Google has not looked at them yet.",
    steps: ["Nothing to do. They are checked in the next nightly run."] },
  { match: /could not inspect/i, level: "info", source: "Google systems", action: "none", what: "Google's checking tool failed for these pages this time. It is not a problem with the page.",
    steps: ["Nothing to do. It is tried again tomorrow."] },
];
const GENERIC: Omit<Help, "match"> = { level: "info", source: "Google systems", action: "inspect", what: "Google is not listing these pages.", steps: [SEND] };

const CRAWL: Record<string, { title: string; level: Level; what: string; steps: string[] }> = {
  broken: { title: "Pages that do not load (broken)", level: "bad", what: "These pages are in your sitemap but give an error when opened.", steps: ["Open the page to see the error.", "Fix it, or remove it from the sitemap. Tell Claude which one you prefer."] },
  redirect: { title: "Sitemap pages that redirect", level: "info", what: "These addresses are in your sitemap but send people somewhere else. Google prefers sitemaps that list the final address.", steps: ["Open the address and note where it ends up.", "Ask Claude to put the final address in the sitemap instead."] },
  noindex: { title: "Sitemap pages with a noindex tag", level: "warn", what: "These pages are listed in the sitemap (“please index”) but also say noindex (“do not index”). They contradict each other.", steps: ["Decide: should this page be in Google?", "If yes, remove the noindex tag. If no, remove it from the sitemap. Ask Claude to do either."] },
  "no-title": { title: "Pages with no title", level: "warn", what: "A page without a title shows up badly in Google, or not at all.", steps: ["Open the page.", "Ask Claude to add a clear title (under 60 characters) and a one-sentence description."] },
  "not-in-sitemap": { title: "Pages missing from the sitemap", level: "info", what: "These pages are linked from your home page but are not in the sitemap, so Google may not find them.", steps: ["Ask Claude to add them to the sitemap, then send one to Google."] },
};

const nameOf = (host: string) => SITES[host] ?? host;
const plural = (k: number, one: string, many = one + "s") => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;
const full = (host: string, path: string) => (/^https?:\/\//.test(path) ? path : `https://${host}${path.startsWith("/") ? path : `/${path}`}`);
const rank: Record<Level, number> = { bad: 0, warn: 1, info: 2, good: 3 };

export interface IssueInput {
  site: string;
  health?: HealthFile | null;
  crawl?: CrawlFile | null;
  alerts?: AlertItem[] | null;
  live?: Live | null;
  /** People this period per host name, to judge whether a live count looks wrong. */
  peopleBy?: Record<string, number>;
  now?: number;
}

export function buildIssues(i: IssueInput): Issue[] {
  const hosts = i.site === "all" ? SITE_HOSTS : [i.site];
  const now = i.now ?? Date.now();
  const out: Issue[] = [];

  // 1. Google's reasons for not listing pages, one row per reason (like Search Console's "Why pages aren't indexed").
  const byReason = new Map<string, IssuePage[]>();
  hosts.forEach((host) => {
    i.health?.index?.[host]?.urls.forEach(([url, state, crawled]) => {
      const list = byReason.get(state) ?? [];
      list.push({ url, host, note: crawled ? `Last crawled ${crawled}` : undefined });
      byReason.set(state, list);
    });
  });
  byReason.forEach((pages, state) => {
    const h = HELP.find((x) => x.match.test(state)) ?? GENERIC;
    out.push({ id: `g:${state}`, level: h.level, title: state, source: h.source, count: pages.length, what: h.what, steps: h.steps, pages, action: h.action, link: h.action === "inspect" ? { href: "/fix/", label: "Open the To do list" } : undefined });
  });

  // 2. Problems found when the nightly check loads every sitemap page.
  const crawlBy: Record<string, IssuePage[]> = {};
  hosts.forEach((host) => i.crawl?.sites?.[host]?.issues.forEach((x) => { (crawlBy[x.kind] ||= []).push({ url: x.url, host, note: x.detail }); }));
  Object.entries(crawlBy).forEach(([kind, pages]) => {
    const c = CRAWL[kind];
    if (!c) return;
    out.push({ id: `c:${kind}`, level: c.level, title: c.title, source: "Website", count: pages.length, what: c.what, steps: c.steps, pages, action: "open" });
  });

  // 3. Alerts of the last 3 days: pages that dropped out of Google, and jobs that failed.
  const recent = (i.alerts ?? []).filter((a) => now - Date.parse(a.at) < 3 * 864e5);
  const hostOf = (t: string) => /on (\S+)$/.exec(t)?.[1] ?? "";
  const lead = (t: string) => +(/^(\d+)/.exec(t)?.[1] ?? 1);
  const dropped = recent.filter((a) => a.kind === "dropped" && a.level !== "good");
  if (dropped.length) {
    const pages: IssuePage[] = dropped.flatMap((a) => (a.detail ?? "").split(",").map((p) => p.trim()).filter(Boolean).map((p) => ({ url: full(hostOf(a.title), p), host: hostOf(a.title) })));
    const total = dropped.reduce((s, a) => s + lead(a.title), 0);
    const names = [...new Set(dropped.map((a) => nameOf(hostOf(a.title))))];
    out.push({
      id: "dropped", level: "bad", title: `${plural(total, "page")} dropped out of Google`, source: "Google systems", count: total,
      what: `${names.length ? `On ${names.join(", ")}. ` : ""}These pages were in Google and are gone now. It often happens after a page changes, is slow, or looks like another page.`,
      steps: ["Open each page below and check it loads and still has real content.", SEND, "Do not change the address of the page. If it was moved, tell Claude."],
      pages, action: "inspect",
    });
  }
  const seen = new Set<string>();
  recent.filter((a) => a.kind === "workflow" && a.level !== "good").forEach((a) => {
    if (seen.has(a.title)) return;
    seen.add(a.title);
    out.push({ id: `job:${a.id}`, level: "bad", title: a.title, source: "Automation", count: 1, what: a.detail ? `${a.detail}. An automatic job did not finish, so what it does (a post, a deploy or a check) has not happened.` : "An automatic job did not finish.", steps: ["Open Automatic jobs and find the one with a red dot.", "Tap “view run” to see the error line.", "Tell Claude the job name, or press “Re-run” if it is only a temporary problem."], pages: [], action: "none", link: { href: "/jobs/", label: "Open Automatic jobs" } });
  });
  const fresh = (i.alerts ?? []).filter((a) => a.kind === "indexed" && now - Date.parse(a.at) < 3 * 864e5);
  if (fresh.length) {
    const total = fresh.reduce((s, a) => s + lead(a.title), 0);
    const names = [...new Set(fresh.map((a) => nameOf(hostOf(a.title))))];
    out.push({ id: "got-in", level: "good", title: `${plural(total, "new page")} got into Google`, source: "Google systems", count: total, what: `Over the last 3 days${names.length ? `, on ${names.slice(0, 4).join(", ")}` : ""}. They can now show up in search.`, steps: [], pages: [], action: "none" });
  }

  // 4. A live count far out of line with the period total is almost always test or robot traffic.
  const liveBy: Record<string, number> = {};
  (i.live?.streams.rows ?? []).forEach((r) => { liveBy[String(r[0])] = (liveBy[String(r[0])] || 0) + (+r[1] || 0); });
  hosts.forEach((host) => {
    const stream = Object.keys(STREAMS).find((k) => STREAMS[k] === nameOf(host));
    const lv = stream ? liveBy[stream] ?? 0 : 0;
    const people = i.peopleBy?.[host] ?? 0;
    if (lv >= 20 && lv > Math.max(10, people)) out.push({ id: `odd-live-${host}`, level: "info", title: `${nameOf(host)} shows ${lv} people online, which looks too high`, source: "Dashboard", count: lv, what: `Over the whole period only ${plural(people, "person", "people")} visited. A number like this is usually test or robot traffic and clears within an hour.`, steps: ["Nothing to do. Check again in an hour."], pages: [], action: "none" });
  });

  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.count - a.count);
}

export const needsLook = (list: Issue[]) => list.filter((x) => x.level === "bad" || x.level === "warn");

/** How much really needs you: distinct pages (a page that is in two rows counts once), plus failed jobs, plus the number of groups. */
export function actionTotals(list: Issue[]): { pages: number; jobs: number; groups: number } {
  const need = needsLook(list);
  const urls = new Set<string>();
  need.forEach((x) => x.pages.forEach((p) => urls.add(p.url)));
  const jobs = need.filter((x) => x.source === "Automation").reduce((a, x) => a + x.count, 0);
  return { pages: urls.size, jobs, groups: need.length };
}

/** "89 pages need action" / "89 pages and 1 job need action" / "Nothing needs action". */
export function actionLine(t: { pages: number; jobs: number }): string {
  const parts = [t.pages ? `${t.pages.toLocaleString("en-US")} ${t.pages === 1 ? "page" : "pages"}` : "", t.jobs ? `${t.jobs} ${t.jobs === 1 ? "job" : "jobs"}` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} need${parts.length === 1 && (t.pages === 1 || (!t.pages && t.jobs === 1)) ? "s" : ""} action` : "Nothing needs action";
}
