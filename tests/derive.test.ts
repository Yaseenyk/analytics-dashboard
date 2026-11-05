import { describe, expect, it } from "vitest";
import { bingDaily, bingMerge, bingTotals, classify, daily, dailyAll, dur, filtered, fmtCell, group, gscDaily, gscMerge, gscMissing, gscTotals, n, ndate, nice, pct, sourcesAgg, sum } from "@/lib/derive";
import type { BingFile, GAFile, GSCFile, Rep } from "@/lib/types";

describe("formatting", () => {
  it("n() abbreviates large numbers and tolerates junk", () => {
    expect(n(0)).toBe("0");
    expect(n(1234)).toBe("1,234");
    expect(n(15400)).toBe("15.4k");
    expect(n(2_500_000)).toBe("2.5M");
    expect(n("abc")).toBe("0");
    expect(n(undefined)).toBe("0");
  });
  it("pct() never divides by zero", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(5, 0)).toBe(0);
  });
  it("dur() reads as seconds or minutes", () => {
    expect(dur(42)).toBe("42s");
    expect(dur(125)).toBe("2m 5s");
    expect(dur(NaN)).toBe("0s");
  });
  it("ndate() turns GA4 dates into ISO and leaves others alone", () => {
    expect(ndate("20261104")).toBe("2026-11-04");
    expect(ndate("2026-11-04")).toBe("2026-11-04");
  });
  it("nice() rewrites GA4 placeholders in plain words", () => {
    expect(nice("(direct) / (none)")).toBe("direct / no source info");
    expect(nice("(not set)")).toBe("not tagged");
  });
  it("fmtCell() applies the column format", () => {
    expect(fmtCell(12345, "n")).toBe("12.3k");
    expect(fmtCell(3.14159, "p")).toBe("3.1%");
    expect(fmtCell(7.25, "pos")).toBe("7.3");
    expect(fmtCell(90, "dur")).toBe("1m 30s");
    expect(fmtCell("(not set)")).toBe("not tagged");
  });
});

const REP: Rep = {
  dims: ["date", "hostName"],
  mets: ["sessions", "keyEvents"],
  rows: [
    ["20261101", "streamerosai.com", 10, 1],
    ["20261102", "streamerosai.com", 20, 2],
    ["20261101", "yk.streamerosai.com", 5, 0],
    ["20261101", "localhost", 99, 9], // not one of our sites: must be ignored in "all"
  ],
};

describe("GA4 reports", () => {
  it("filtered() drops hosts that are not our sites in the 'all' view", () => {
    expect(filtered(REP, "all")).toHaveLength(3);
    expect(filtered(REP, "yk.streamerosai.com")).toHaveLength(1);
  });
  it("sum() adds a metric for the chosen site", () => {
    expect(sum(REP, "sessions", "all")).toBe(35);
    expect(sum(REP, "sessions", "streamerosai.com")).toBe(30);
    expect(sum(REP, "nope", "all")).toBe(0);
  });
  it("group() totals by dimension and sorts by the first metric", () => {
    const g = group(REP, [1], "all");
    expect(g.map((x) => x.k[0])).toEqual(["streamerosai.com", "yk.streamerosai.com"]);
    expect(g[0].m).toEqual([30, 3]);
  });
  it("daily() gives one series per site with sorted points", () => {
    const s = daily(REP, "sessions", "all");
    const so = s.find((x) => x.name === "streamerOS")!;
    expect(so.pts).toEqual([
      ["2026-11-01", 10],
      ["2026-11-02", 20],
    ]);
    expect(dailyAll(REP, "sessions", "all")).toEqual([
      ["2026-11-01", 15],
      ["2026-11-02", 20],
    ]);
  });
  it("a report without a hostName column is not filtered", () => {
    const r: Rep = { dims: ["date"], mets: ["sessions"], rows: [["20261101", 4]] };
    expect(sum(r, "sessions", "streamerosai.com")).toBe(4);
  });
});

const gsc = (host: string, o: Record<string, unknown>) => ({ [`https://${host}/`]: { ok: true, ...o } });
const GSC = {
  search: {
    ...gsc("streamerosai.com", { total: [10, 100, 10, 5], totalPrev: [4, 80, 5, 6], queries: [["obs", 8, 80, 10, 4]], daily: [["2026-11-01", 5, 50, 10, 4]] }),
    ...gsc("yk.streamerosai.com", { total: [0, 20, 0, 15], totalPrev: [0, 0, 0, 0], queries: [["obs", 2, 20, 10, 10]], daily: [["2026-11-01", 1, 10, 10, 8]] }),
    "https://fitrank.streamerosai.com/": { ok: false },
  },
} as unknown as GSCFile;

describe("Search Console", () => {
  it("gscTotals() weights position by impressions and supports the previous period", () => {
    const t = gscTotals(GSC, "all", false);
    expect(t.clicks).toBe(10);
    expect(t.impr).toBe(120);
    expect(t.ctr).toBeCloseTo(8.333, 2);
    expect(t.pos).toBeCloseTo((5 * 100 + 15 * 20) / 120, 5);
    expect(gscTotals(GSC, "all", true).clicks).toBe(4);
    expect(gscTotals(null, "all", false)).toEqual({ clicks: 0, impr: 0, ctr: 0, pos: 0 });
  });
  it("gscMissing() lists sites whose property failed or is absent", () => {
    expect(gscMissing(GSC, "fitrank.streamerosai.com")).toEqual(["fitrank.streamerosai.com"]);
    expect(gscMissing(GSC, "streamerosai.com")).toEqual([]);
  });
  it("gscMerge() merges the same query across sites", () => {
    const m = gscMerge(GSC, "all", "queries", 1);
    expect(m).toHaveLength(1);
    expect(m[0].slice(0, 3)).toEqual(["obs", 10, 100]);
  });
  it("gscDaily() merges the same day across sites", () => {
    const d = gscDaily(GSC, "all");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ d: "2026-11-01", clicks: 6, impr: 60 });
  });
});

const BING = {
  sites: {
    "streamerosai.com": { ok: true, total: [3, 30, 10, 0], totalPrev: [1, 10, 10, 0], queries: [["obs", 3, 30, 10, 5]], pages: [["/a", 3, 30, 10, 5]], daily: [["2026-11-01", 3, 30]] },
    "yk.streamerosai.com": { ok: false },
  },
} as unknown as BingFile;

describe("Bing", () => {
  it("only counts sites that answered", () => {
    expect(bingTotals(BING, "all", false).clicks).toBe(3);
    expect(bingTotals(BING, "yk.streamerosai.com", false).clicks).toBe(0);
  });
  it("bingMerge() and bingDaily() read their lists", () => {
    expect(bingMerge(BING, "all", "queries")[0][0]).toBe("obs");
    expect(bingDaily(BING, "all")[0]).toMatchObject({ d: "2026-11-01", clicks: 3, impr: 30 });
  });
});

describe("traffic sources", () => {
  it("classify() names and groups the common sources", () => {
    expect(classify("google", "organic")).toEqual({ name: "Google", cat: "Search engines" });
    expect(classify("chatgpt.com", "referral").cat).toBe("AI assistants");
    expect(classify("(direct)", "(none)")).toEqual({ name: "Direct / unknown", cat: "Direct" });
    expect(classify("lnkd.in", "referral")).toEqual({ name: "LinkedIn", cat: "Social and messaging" });
    expect(classify("news.ycombinator.com", "referral").name).toBe("Hacker News");
    expect(classify("example.org", "referral")).toEqual({ name: "example.org", cat: "Other websites" });
    expect(classify("somemail", "email").cat).toBe("Email");
  });
  it("sourcesAgg() merges sources that classify the same", () => {
    const ga = {
      reports: {
        sourceMedium: {
          dims: ["hostName", "sessionSource", "sessionMedium"],
          mets: ["sessions", "activeUsers", "keyEvents", "newUsers", "engagedSessions"],
          rows: [
            ["streamerosai.com", "google", "organic", 5, 4, 1, 3, 2],
            ["yk.streamerosai.com", "google.com", "referral", 3, 2, 0, 1, 1],
            ["streamerosai.com", "(direct)", "(none)", 9, 8, 0, 7, 4],
          ],
        },
      },
    } as unknown as GAFile;
    const r = sourcesAgg(ga, "all");
    expect(r[0]).toMatchObject({ name: "Direct / unknown", sessions: 9 });
    expect(r.find((x) => x.name === "Google")).toMatchObject({ sessions: 8, users: 6, key: 1, newU: 4, eng: 3 });
  });
});
