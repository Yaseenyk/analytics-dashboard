import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { summarize } from "../scripts/clarity.mjs";

const resp = [
  { metricName: "Traffic", information: [{ totalSessionCount: "120", totalBotSessionCount: "45", distantUserCount: "70", PagesPerSessionPercentage: 1.8 }] },
  { metricName: "ScrollDepth", information: [{ averageScrollDepth: 41.5 }] },
  { metricName: "EngagementTime", information: [{ totalTime: "900", activeTime: "300" }] },
  { metricName: "RageClickCount", information: [{ sessionsCount: "3", sessionsWithMetricPercentage: 2.5 }] },
  { metricName: "DeadClickCount", information: [{ sessionsCount: "9", sessionsWithMetricPercentage: 7.5 }] },
  { metricName: "PopularPages", information: [{ url: "https://x.test/a", visitsCount: "5" }, { url: "https://x.test/b", visitsCount: "50" }, { visitsCount: "9" }] },
];

describe("Clarity summary", () => {
  it("reads sessions, bots and humans from the Traffic metric (numbers arrive as strings)", () => {
    const s = summarize(resp);
    expect(s.sessions).toBe(120);
    expect(s.botSessions).toBe(45);
    expect(s.humanSessions).toBe(75);
    expect(s.users).toBe(70);
    expect(s.pagesPerSession).toBeCloseTo(1.8);
  });
  it("reads scroll depth, active time and the frustration signals", () => {
    const s = summarize(resp);
    expect(s.scrollDepth).toBe(41.5);
    expect(s.activeSeconds).toBe(300);
    expect(s.totalSeconds).toBe(900);
    expect(s.rageClicks).toEqual({ pct: 2.5, sessions: 3 });
    expect(s.deadClicks).toEqual({ pct: 7.5, sessions: 9 });
    expect(s.quickBacks).toBeNull(); // metric absent from the response
  });
  it("lists popular pages most visited first and drops rows without a url", () => {
    expect(summarize(resp).topPages).toEqual([{ url: "https://x.test/b", visits: 50 }, { url: "https://x.test/a", visits: 5 }]);
  });
  it("survives an empty or odd response", () => {
    const s = summarize([]);
    expect(s.sessions).toBeNull();
    expect(s.humanSessions).toBeNull();
    expect(s.topPages).toEqual([]);
    expect(summarize(null).sessions).toBeNull();
  });
});
