import { describe, expect, it } from "vitest";
import { alertTarget, buildToday } from "../src/lib/attention";
import { plainState } from "../src/views/Fix";
import { inspectLink } from "../src/views/Fix";
import { GLOSSARY, termOf } from "../src/lib/glossary";
import { TABS, GROUPS, tabsOf } from "../src/lib/config";
import type { AlertItem, GAFile, GSCFile, HealthFile, Live } from "../src/lib/types";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const mets = ["activeUsers", "sessions", "keyEvents"];
const ga = (cur: Record<string, number[]>, prev: Record<string, number[]> = {}): GAFile => ({
  range: "28d", days: 28, generatedAt: "x",
  reports: {
    totals: { dims: ["hostName"], mets, rows: Object.entries(cur).map(([h, m]) => [h, ...m]) },
    totalsPrev: { dims: ["hostName"], mets, rows: Object.entries(prev).map(([h, m]) => [h, ...m]) },
  },
});
const gsc = (m: Record<string, [number, number]>): GSCFile => ({
  range: "28d", days: 28, generatedAt: "x", startDate: "a", endDate: "b",
  search: Object.fromEntries(Object.entries(m).map(([h, [c, p]]) => [`https://${h}/`, { ok: true, total: [c, 100, 1, 10], totalPrev: [p, 100, 1, 10] }])),
});
const health = (m: Record<string, [number, number]>): HealthFile => ({
  generatedAt: "x", indexAt: null,
  index: Object.fromEntries(Object.entries(m).map(([h, [indexed, notIndexed]]) => [h, { property: h, inspected: indexed + notIndexed, indexed, notIndexed, byState: {}, urls: [] }])),
});
const base = { days: 28, site: "all", now: NOW } as const;

describe("Today: the headline and the numbers", () => {
  it("says people are up when they grew by 10% or more", () => {
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [120, 130, 2] }, { "yk.streamerosai.com": [100, 110, 1] }), gsc: null, health: null, live: null, alerts: [] });
    expect(m.headline).toBe("Looking good");
    expect(m.sentences[0]).toMatch(/More people came: 120 .* up 20%/);
    expect(m.sentences.at(-1)).toBe("Nothing is broken.");
    expect(m.totals.people).toBe(120);
  });

  it("says people are down, steady, or first-time in plain words", () => {
    expect(buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [70, 70, 0] }, { "yk.streamerosai.com": [100, 100, 0] }), gsc: null, health: null, live: null, alerts: [] }).sentences[0]).toMatch(/Fewer people came: 70 .* down 30%/);
    expect(buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [102, 100, 0] }, { "yk.streamerosai.com": [100, 100, 0] }), gsc: null, health: null, live: null, alerts: [] }).headline).toBe("All steady");
    expect(buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [5, 5, 0] }), gsc: null, health: null, live: null, alerts: [] }).sentences[0]).toBe("5 people visited in the last 28 days.");
  });

  it("does not call a site new, or say anything grew, when last period is not available", () => {
    const m = buildToday({ ...base, ga: { range: "28d", days: 28, generatedAt: "x", reports: { totals: { dims: ["hostName"], mets, rows: [["yk.streamerosai.com", 40, 40, 0]] } } }, gsc: null, health: null, live: null, alerts: [] });
    expect(m.sites.find((s) => s.host === "yk.streamerosai.com")!.state).toBe("steady");
    expect(m.items.some((x) => x.id.startsWith("new-"))).toBe(false);
    expect(m.sentences[0]).toBe("40 people visited in the last 28 days.");
  });

  it("is honest when there are no numbers yet", () => {
    const m = buildToday({ ...base, ga: null, gsc: null, health: null, live: null, alerts: [] });
    expect(m.ready).toBe(false);
    expect(m.headline).toBe("Getting started");
    expect(m.sentences[0]).toMatch(/Waiting for the first visitor numbers/);
  });

  it("limits everything to one site when one is picked", () => {
    const m = buildToday({ ...base, site: "yk.streamerosai.com", ga: ga({ "yk.streamerosai.com": [10, 10, 0], "campus.streamerosai.com": [90, 90, 0] }), gsc: null, health: null, live: null, alerts: [] });
    expect(m.totals.people).toBe(10);
    expect(m.sites).toHaveLength(1);
  });

  it("labels each site growing, steady, quiet or new", () => {
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [50, 50, 0], "campus.streamerosai.com": [20, 20, 0], "fitrank.streamerosai.com": [1, 1, 0], "esports.streamerosai.com": [4, 4, 0] }, { "yk.streamerosai.com": [20, 20, 0], "campus.streamerosai.com": [20, 20, 0], "fitrank.streamerosai.com": [1, 1, 0] }), gsc: null, health: null, live: null, alerts: [] });
    const by = Object.fromEntries(m.sites.map((s) => [s.host, s.state]));
    expect(by["yk.streamerosai.com"]).toBe("growing");
    expect(by["campus.streamerosai.com"]).toBe("steady");
    expect(by["fitrank.streamerosai.com"]).toBe("quiet");
    expect(by["esports.streamerosai.com"]).toBe("new");
  });
});

describe("Today: what needs you", () => {
  it("lists pages that are not in Google, with the busiest site first and a button to fix", () => {
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [10, 10, 0] }), gsc: null, health: health({ "yk.streamerosai.com": [60, 5], "streamerosai.com": [80, 9] }), live: null, alerts: [] });
    const it = m.items.find((x) => x.id === "not-in-google")!;
    expect(it.title).toBe("14 pages not in Google yet");
    expect(it.level).toBe("warn");
    expect(it.detail).toMatch(/streamerOS \(9\) and Portfolio \(5\)/);
    expect(it.href).toBe("/fix/");
    expect(m.headline).toMatch(/need|needs/);
  });

  it("turns a recent failed-job alert into a button to the jobs page, and ignores old or good ones", () => {
    const alerts: AlertItem[] = [
      { id: "a", kind: "workflow", level: "bad", title: "Deploy failed", at: "2026-11-12T08:00:00Z" },
      { id: "b", kind: "workflow", level: "bad", title: "Old failure", at: "2026-11-01T08:00:00Z" },
      { id: "c", kind: "index", level: "good", title: "Page got in", at: "2026-11-12T08:00:00Z" },
    ];
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [10, 10, 0] }), gsc: null, health: null, live: null, alerts });
    const ids = m.items.map((x) => x.id);
    expect(ids).toContain("alert-a");
    expect(ids).not.toContain("alert-b");
    expect(ids).not.toContain("alert-c");
    expect(m.items.find((x) => x.id === "alert-a")!.href).toBe("/jobs/");
    expect(m.items[0].level).toBe("bad");
  });

  it("merges every dropped-page alert into one card, and sums the good news into one", () => {
    const alerts: AlertItem[] = [
      { id: "d1", kind: "dropped", level: "bad", title: "1 page dropped out of Google on spotai.streamerosai.com", at: "2026-11-11T08:00:00Z" },
      { id: "d2", kind: "dropped", level: "bad", title: "2 pages dropped out of Google on campus.streamerosai.com", at: "2026-11-10T08:00:00Z" },
      { id: "g1", kind: "indexed", level: "good", title: "4 new pages in Google on fitrank.streamerosai.com", at: "2026-11-12T08:00:00Z" },
      { id: "g2", kind: "indexed", level: "good", title: "1 new page in Google on yk.streamerosai.com", at: "2026-11-11T08:00:00Z" },
      { id: "g3", kind: "indexed", level: "good", title: "9 new pages in Google on yk.streamerosai.com", at: "2026-11-01T08:00:00Z" },
    ];
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [10, 10, 0] }), gsc: null, health: null, live: null, alerts });
    expect(m.items.filter((x) => x.id === "dropped")).toHaveLength(1);
    expect(m.items.find((x) => x.id === "dropped")!.title).toBe("3 pages dropped out of Google");
    expect(m.items.find((x) => x.id === "dropped")!.detail).toMatch(/SpotAI, DefendIt/);
    expect(m.items.find((x) => x.id === "got-in")!.title).toBe("5 new pages got into Google"); // the 9 from 11 days ago is not counted
    expect(m.items[0].id).toBe("dropped");
  });

  it("flags an online count that is far out of line, without alarm", () => {
    const live: Live = { generatedAt: "x", streams: { dims: ["streamName"], mets: ["activeUsers"], rows: [["Esports Hub", 205]] }, pages: { dims: [], mets: [], rows: [] }, countries: { dims: [], mets: [], rows: [] } };
    const m = buildToday({ ...base, ga: ga({ "esports.streamerosai.com": [2, 2, 0] }), gsc: null, health: null, live, alerts: [] });
    const it = m.items.find((x) => x.id === "odd-live-esports.streamerosai.com")!;
    expect(it.level).toBe("info");
    expect(it.title).toMatch(/205 people online, which looks too high/);
    expect(m.headline).not.toMatch(/need/);
  });

  it("celebrates first visitors and a jump in Google clicks", () => {
    const m = buildToday({ ...base, ga: ga({ "esports.streamerosai.com": [4, 4, 0] }, { "yk.streamerosai.com": [1, 1, 0] }), gsc: gsc({ "esports.streamerosai.com": [30, 10] }), health: null, live: null, alerts: [] });
    expect(m.items.map((x) => x.id)).toEqual(expect.arrayContaining(["new-esports.streamerosai.com", "clicks-up"]));
    expect(m.items.find((x) => x.id === "clicks-up")!.title).toBe("Google clicks are up 200%");
  });

  it("never shows more than six items, most serious first", () => {
    const alerts: AlertItem[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, kind: "traffic", level: i === 5 ? "bad" : "warn", title: `Alert ${i}`, at: "2026-11-12T08:00:00Z" }));
    const m = buildToday({ ...base, ga: ga({ "yk.streamerosai.com": [10, 10, 0] }), gsc: null, health: health({ "yk.streamerosai.com": [1, 20] }), live: null, alerts });
    expect(m.items.length).toBeLessThanOrEqual(6);
  });
});

describe("alert wording to destination", () => {
  it.each([
    ["Workflow failed", "workflow", "/jobs/"],
    ["Pages left Google", "index", "/fix/"],
    ["Traffic dropped", "traffic", "/traffic/"],
    ["Broken page found", "crawl", "/health/"],
  ])("%s", (title, kind, href) => expect(alertTarget({ id: "x", kind, level: "warn", title, at: "x" }).href).toBe(href));
});

describe("the Search Console helper and the words", () => {
  it("opens the inspection page for the exact address, on the domain property", () => {
    const u = inspectLink("https://esports.streamerosai.com/tools/bracket/");
    expect(u).toBe("https://search.google.com/search-console/inspect?resource_id=sc-domain%3Astreamerosai.com&id=https%3A%2F%2Fesports.streamerosai.com%2Ftools%2Fbracket%2F");
  });
  it("turns Google's status words into everyday sentences", () => {
    expect(plainState("Discovered - currently not indexed")).toMatch(/knows it exists/);
    expect(plainState("Crawled - currently not indexed")).toMatch(/chose not to keep/);
    expect(plainState("URL is unknown to Google")).toMatch(/never seen/);
    expect(plainState("Something new")).toBe("Something new");
  });
  it("every glossary entry explains itself and no term is missing a sentence", () => {
    for (const [k, t] of Object.entries(GLOSSARY)) {
      expect(t.name.length, k).toBeGreaterThan(1);
      expect(t.plain.length, k).toBeGreaterThan(30);
    }
    expect(termOf("nope")).toBeNull();
  });
  it("every page belongs to a group, the groups cover the bottom bar, and no page is lost", () => {
    const ids = GROUPS.map((g) => g.id);
    TABS.forEach((t) => expect(ids, t.id).toContain(t.group));
    GROUPS.forEach((g) => expect(tabsOf(g.id).length, g.id).toBeGreaterThan(0));
    expect(TABS.map((t) => t.href)).toEqual(expect.arrayContaining(["/", "/traffic/", "/sources/", "/pages/", "/audience/", "/live/", "/leads/", "/search/", "/rankings/", "/health/", "/ads/", "/fix/", "/tools/", "/jobs/", "/help/"]));
    TABS.forEach((t) => expect(t.what.length, t.id).toBeGreaterThan(20));
  });
});
