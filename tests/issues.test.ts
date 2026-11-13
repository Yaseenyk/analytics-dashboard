import { gscProperty } from "../src/lib/config";
import { describe, expect, it } from "vitest";
import { actionLine, actionTotals, buildIssues, inspectLink, needsLook, plainState } from "../src/lib/issues";
import { GLOSSARY, termOf } from "../src/lib/glossary";
import { GROUPS, TABS, tabsOf } from "../src/lib/config";
import { peopleByHost, todayBy } from "../src/lib/today";
import { gscStyle } from "../src/views/Alerts";
import type { AlertItem, CrawlFile, GAFile, HealthFile, Live } from "../src/lib/types";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const health = (m: Record<string, [string, string][]>): HealthFile => ({
  generatedAt: "x", indexAt: null,
  index: Object.fromEntries(Object.entries(m).map(([h, urls]) => [h, { property: h, inspected: urls.length + 5, indexed: 5, notIndexed: urls.length, byState: {}, urls: urls.map(([u, s]) => [u, s, "2026-11-01"] as [string, string, string]) }])),
});
const base = { site: "all", now: NOW } as const;

describe("issues: Google's reasons, one row per reason like Search Console", () => {
  it("groups pages by Google's reason, with counts, steps and pages to act on", () => {
    const h = health({
      "yk.streamerosai.com": [["https://yk.streamerosai.com/a/", "Crawled - currently not indexed"], ["https://yk.streamerosai.com/b/", "URL is unknown to Google"]],
      "streamerosai.com": [["https://streamerosai.com/c/", "Crawled - currently not indexed"]],
    });
    const list = buildIssues({ ...base, health: h });
    const crawled = list.find((x) => x.id === "g:Crawled - currently not indexed")!;
    expect(crawled.count).toBe(2);
    expect(crawled.level).toBe("warn");
    expect(crawled.source).toBe("Google systems");
    expect(crawled.action).toBe("inspect");
    expect(crawled.steps.length).toBeGreaterThanOrEqual(3);
    expect(crawled.pages.map((p) => p.url).sort()).toEqual(["https://streamerosai.com/c/", "https://yk.streamerosai.com/a/"]);
    expect(list.find((x) => x.id === "g:URL is unknown to Google")!.count).toBe(1);
  });

  it("marks website problems as such and gives them an open-the-page action", () => {
    const h = health({ "yk.streamerosai.com": [["https://yk.streamerosai.com/x/", "Not found (404)"], ["https://yk.streamerosai.com/y/", "Page with redirect"]] });
    const list = buildIssues({ ...base, health: h });
    const nf = list.find((x) => x.title === "Not found (404)")!;
    expect(nf.source).toBe("Website");
    expect(nf.level).toBe("bad");
    expect(nf.action).toBe("open");
    expect(list.find((x) => x.title === "Page with redirect")!.level).toBe("info");
    expect(list[0].id).toBe(nf.id); // most serious first
  });

  it("limits to one site when one is picked", () => {
    const h = health({ "yk.streamerosai.com": [["https://yk.streamerosai.com/a/", "URL is unknown to Google"]], "streamerosai.com": [["https://streamerosai.com/c/", "URL is unknown to Google"]] });
    expect(buildIssues({ ...base, site: "yk.streamerosai.com", health: h })[0].count).toBe(1);
  });

  it("reads the nightly site check into plain rows", () => {
    const crawl: CrawlFile = { generatedAt: "x", sites: { "yk.streamerosai.com": { checked: 10, counts: {}, issues: [{ url: "https://yk.streamerosai.com/p/", kind: "broken", detail: "HTTP 500" }, { url: "https://yk.streamerosai.com/q/", kind: "no-title", detail: "" }] } } };
    const list = buildIssues({ ...base, crawl });
    expect(list.find((x) => x.id === "c:broken")!.level).toBe("bad");
    expect(list.find((x) => x.id === "c:broken")!.pages[0].note).toBe("HTTP 500");
    expect(list.find((x) => x.id === "c:no-title")!.steps.length).toBeGreaterThan(0);
  });
});

describe("issues: alerts, live counts, good news", () => {
  const alerts: AlertItem[] = [
    { id: "d1", kind: "dropped", level: "bad", title: "1 page dropped out of Google on spotai.streamerosai.com", detail: "/hi/features/workouts/", at: "2026-11-11T08:00:00Z" },
    { id: "d2", kind: "dropped", level: "bad", title: "2 pages dropped out of Google on campus.streamerosai.com", detail: "/guides/a/, /guides/b/", at: "2026-11-10T08:00:00Z" },
    { id: "d3", kind: "dropped", level: "bad", title: "1 page dropped out of Google on yk.streamerosai.com", detail: "/old/", at: "2026-10-01T08:00:00Z" },
    { id: "w1", kind: "workflow", level: "bad", title: "Deploy failed in portfolio", detail: "Deploy", at: "2026-11-12T08:00:00Z" },
    { id: "w2", kind: "workflow", level: "bad", title: "Deploy failed in portfolio", detail: "Deploy", at: "2026-11-12T07:00:00Z" },
    { id: "g1", kind: "indexed", level: "good", title: "4 new pages in Google on fitrank.streamerosai.com", at: "2026-11-12T08:00:00Z" },
    { id: "g2", kind: "indexed", level: "good", title: "9 new pages in Google on yk.streamerosai.com", at: "2026-11-01T08:00:00Z" },
  ];

  it("merges dropped pages into one row with the real page addresses, and ignores old ones", () => {
    const list = buildIssues({ ...base, alerts });
    const d = list.find((x) => x.id === "dropped")!;
    expect(d.title).toBe("3 pages dropped out of Google");
    expect(d.pages.map((p) => p.url)).toEqual(["https://spotai.streamerosai.com/hi/features/workouts/", "https://campus.streamerosai.com/guides/a/", "https://campus.streamerosai.com/guides/b/"]);
    expect(d.what).toMatch(/DefendIt, SpotAI|SpotAI, DefendIt/);
  });

  it("shows a failed job once, with a way to the jobs page", () => {
    const jobs = buildIssues({ ...base, alerts }).filter((x) => x.source === "Automation");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].link?.href).toBe("/jobs/");
    expect(jobs[0].action).toBe("none");
  });

  it("adds recent good news and counts only the last 3 days", () => {
    expect(buildIssues({ ...base, alerts }).find((x) => x.id === "got-in")!.title).toBe("4 new pages got into Google");
  });

  it("needsLook keeps only problems and things to check, never good news or notes", () => {
    const list = buildIssues({ ...base, alerts });
    const need = needsLook(list);
    expect(need.every((x) => x.level === "bad" || x.level === "warn")).toBe(true);
    expect(need.some((x) => x.id === "got-in")).toBe(false);
  });

  it("flags an online count far out of line, without alarm", () => {
    const live: Live = { generatedAt: "x", streams: { dims: ["streamName"], mets: ["activeUsers"], rows: [["Esports Hub", 205]] }, pages: { dims: [], mets: [], rows: [] }, countries: { dims: [], mets: [], rows: [] } };
    const it = buildIssues({ ...base, live, peopleBy: { "esports.streamerosai.com": 2 } }).find((x) => x.id === "odd-live-esports.streamerosai.com")!;
    expect(it.level).toBe("info");
    expect(it.title).toMatch(/205 people online, which looks too high/);
  });
});

describe("honest counts of what needs action", () => {
  it("counts distinct pages, not rows, and keeps failed jobs apart", () => {
    const h = health({
      "yk.streamerosai.com": [["https://yk.streamerosai.com/a/", "URL is unknown to Google"], ["https://yk.streamerosai.com/b/", "Discovered - currently not indexed"], ["https://yk.streamerosai.com/n/", "Excluded by ‘noindex’ tag"]],
    });
    const alerts: AlertItem[] = [
      { id: "d", kind: "dropped", level: "bad", title: "2 pages dropped out of Google on yk.streamerosai.com", detail: "/a/, /z/", at: "2026-11-11T08:00:00Z" },
      { id: "w", kind: "workflow", level: "bad", title: "Deploy failed in portfolio", detail: "Deploy", at: "2026-11-12T08:00:00Z" },
    ];
    const list = buildIssues({ ...base, health: h, alerts });
    const t = actionTotals(list);
    expect(t.pages).toBe(3); // /a/ is in two rows and counts once; /b/ and /z/ add two; the noindex page needs nothing
    expect(t.jobs).toBe(1);
    expect(t.groups).toBe(4);
    expect(actionLine(t)).toBe("3 pages and 1 job need action");
  });
  it("words the line correctly for one thing, jobs only, and nothing", () => {
    expect(actionLine({ pages: 1, jobs: 0 })).toBe("1 page needs action");
    expect(actionLine({ pages: 0, jobs: 2 })).toBe("2 jobs need action");
    expect(actionLine({ pages: 0, jobs: 0 })).toBe("Nothing needs action");
    expect(actionTotals([])).toEqual({ pages: 0, jobs: 0, groups: 0 });
  });
});

describe("Search Console-style notifications and helpers", () => {
  it("words alerts the way Search Console's inbox does", () => {
    const g = gscStyle({ id: "x", kind: "dropped", level: "bad", title: "2 pages dropped out of Google on campus.streamerosai.com", at: "x" });
    expect(g.group).toBe("Page indexing");
    expect(g.title).toBe("Page indexing issue detected on DefendIt");
    expect(g.text).toMatch(/2 pages are no longer in Google/);
    expect(gscStyle({ id: "y", kind: "indexed", level: "good", title: "1 new page in Google on yk.streamerosai.com", at: "x" }).title).toBe("New pages indexed on Portfolio");
  });
  it("opens the Search Console property of the page's own site, written the way Search Console writes it", () => {
    expect(inspectLink("https://esports.streamerosai.com/tools/bracket/")).toBe("https://search.google.com/search-console?resource_id=https%3A%2F%2Fesports.streamerosai.com%2F");
    expect(inspectLink("https://calc.streamerosai.com/x/")).toBe("https://search.google.com/search-console?resource_id=https%3A%2F%2Fcalc.streamerosai.com%2F");
    expect(inspectLink("https://streamerosai.com/blog/a")).toBe("https://search.google.com/search-console?resource_id=https%3A%2F%2Fstreamerosai.com%2F");
    expect(inspectLink()).toBe("https://search.google.com/search-console?resource_id=https%3A%2F%2Fstreamerosai.com%2F");
    expect(inspectLink("not a url")).not.toMatch(/inspect\?|&id=/);
  });
  it("turns Google's status words into everyday sentences", () => {
    expect(plainState("Discovered - currently not indexed")).toMatch(/knows it exists/);
    expect(plainState("URL is unknown to Google")).toMatch(/never seen/);
    expect(plainState("Something new")).toBe("Something new");
  });
});

describe("today numbers", () => {
  const rep = (rows: (string | number)[][]) => ({ dims: ["date", "hostName"], mets: ["activeUsers", "sessions"], rows });
  const ga = { range: "28d", days: 28, generatedAt: "x", reports: { daily: rep([["20261111", "yk.streamerosai.com", 3, 4], ["20261112", "yk.streamerosai.com", 5, 6], ["20261112", "campus.streamerosai.com", 2, 2]]), totals: { dims: ["hostName"], mets: ["activeUsers"], rows: [["yk.streamerosai.com", 40], ["campus.streamerosai.com", 10]] } } } as unknown as GAFile;
  it("reads the latest day by site", () => {
    const t = todayBy(ga, "all")!;
    expect(t.date).toBe("2026-11-12");
    expect(t.people).toBe(7);
    expect(t.visits).toBe(8);
    expect(t.rows[0].name).toBe("Portfolio");
  });
  it("has nothing to say without a daily report, and sums people per host", () => {
    expect(todayBy(null, "all")).toBeNull();
    expect(peopleByHost(ga)["yk.streamerosai.com"]).toBe(40);
  });
});

describe("words and navigation", () => {
  it("every glossary entry explains itself", () => {
    for (const [k, t] of Object.entries(GLOSSARY)) { expect(t.name.length, k).toBeGreaterThan(1); expect(t.plain.length, k).toBeGreaterThan(30); }
    expect(termOf("nope")).toBeNull();
  });
  it("every page belongs to a group, the bar has four places, and nothing is lost", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["home", "visitors", "todo", "more"]);
    TABS.forEach((t) => expect(GROUPS.map((g) => g.id), t.id).toContain(t.group));
    GROUPS.forEach((g) => expect(tabsOf(g.id).length, g.id).toBeGreaterThan(0));
    expect(TABS.map((t) => t.href)).toEqual(expect.arrayContaining(["/", "/visitors/", "/sources/", "/pages/", "/audience/", "/leads/", "/live/", "/search/", "/bing/", "/clarity/", "/rankings/", "/ads/", "/fix/", "/jobs/", "/tools/", "/help/"]));
    TABS.forEach((t) => expect(t.what.length, t.id).toBeGreaterThan(20));
  });
});

import { botCheck, effects, localAlerts } from "../src/lib/insights";
describe("insights", () => {
  const ga = (rows: (string | number)[][]) => ({ range: "28d", days: 28, generatedAt: new Date().toISOString(), reports: { totals: { dims: ["hostName"], mets: ["sessions", "engagedSessions", "keyEvents"], rows } } }) as never;
  it("flags a site with many visits and almost none engaged as bots", () => {
    const r = botCheck(ga([["esports.streamerosai.com", 100, 3, 0], ["yk.streamerosai.com", 100, 60, 4]]), "all");
    expect(r.find((x) => x.host === "esports.streamerosai.com")?.suspect).toBe(true);
    expect(r.find((x) => x.host === "yk.streamerosai.com")?.suspect).toBe(false);
  });
  it("does not flag a tiny sample", () => {
    expect(botCheck(ga([["esports.streamerosai.com", 10, 0, 0]]), "all")[0].suspect).toBe(false);
  });
  it("says too early when there is little data after a change", () => {
    const day = (d: string, c: number, i: number) => [d, c, i, 0, 10];
    const g = { range: "28d", days: 28, generatedAt: "", search: { "https://solar.streamerosai.com/": { ok: true, daily: [day("2026-11-05", 1, 10), day("2026-11-06", 1, 10), day("2026-11-07", 1, 10), day("2026-11-08", 1, 10), day("2026-11-12", 2, 40)] } } } as never;
    const e = effects(g, [{ date: "2026-11-10", host: "solar.streamerosai.com", text: "x" }]);
    expect(e[0].state).toBe("early");
  });
  it("warns when Google clicks fall by more than 40 percent", () => {
    const g = { range: "28d", days: 28, generatedAt: "", search: { [gscProperty("yk.streamerosai.com")]: { ok: true, total: [10, 100, 1, 5], totalPrev: [50, 100, 1, 5] } } } as never;
    expect(localAlerts(null, g).some((a) => a.id === "local-clicks-drop")).toBe(true);
  });
});
