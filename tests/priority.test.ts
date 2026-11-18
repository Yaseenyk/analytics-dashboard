import { describe, expect, it } from "vitest";
import { ledgerFlags, priorityOf, siteTrend } from "../src/lib/indexing";

describe("priorityOf", () => {
  it("is high when people already search for the page", () => {
    expect(priorityOf("https://math.x.test/percentage-calculator/", "Crawled - currently not indexed", 790).level).toBe("high");
  });
  it("is high for key pages and for pages Google read and refused", () => {
    expect(priorityOf("https://yk.x.test/products/esports-hub/", "Discovered - currently not indexed", 0).level).toBe("high");
    expect(priorityOf("https://yk.x.test/blog/a/", "Crawled - currently not indexed", 0).level).toBe("high");
  });
  it("is medium for a found-but-not-crawled content page", () => {
    expect(priorityOf("https://yk.x.test/blog/b/", "Discovered - currently not indexed", 0).level).toBe("medium");
  });
  it("is medium for a new content page Google has not seen", () => {
    expect(priorityOf("https://campus.x.test/guides/bca-final-year-project/", "URL is unknown to Google", 0).level).toBe("medium");
  });
  it("is low for translated copies, tag pages and unknown pages nobody asked for", () => {
    expect(priorityOf("https://solar.x.test/ta/rooftop/", "URL is unknown to Google", 0).level).toBe("low");
    expect(priorityOf("https://yk.x.test/tag/rag/", "Discovered - currently not indexed", 0).level).toBe("low");
    expect(priorityOf("https://calc.x.test/gbp-to-inr/", "URL is unknown to Google", 0).level).toBe("low");
  });
});

describe("ledgerFlags", () => {
  const NOW = Date.parse("2026-11-17T12:00:00Z");
  const rec = (o = {}) => ({ host: "x.test", state: "needs" as const, firstSeen: "2026-11-01", ...o });
  it("counts days since you sent a page, and says when the wait is over", () => {
    expect(ledgerFlags(rec(), "2026-11-10T00:00:00Z", NOW)).toMatchObject({ asked: 7, stillOut: null, dropped: false });
    expect(ledgerFlags(rec(), "2026-11-01T00:00:00Z", NOW)).toMatchObject({ asked: null, stillOut: 16 });
    expect(ledgerFlags(rec(), undefined, NOW)).toMatchObject({ asked: null, stillOut: null });
  });
  it("flags a drop, and forgets the sent mark when the page dropped after it", () => {
    const dropped = rec({ droppedAt: "2026-11-16", drops: 2 });
    expect(ledgerFlags(dropped, undefined, NOW)).toMatchObject({ dropped: true, drops: 2, dropDate: "2026-11-16" });
    expect(ledgerFlags(dropped, "2026-11-05T00:00:00Z", NOW)).toMatchObject({ sentIsStale: true, asked: null, stillOut: null });
    expect(ledgerFlags(dropped, "2026-11-16T20:00:00Z", NOW)).toMatchObject({ sentIsStale: false, asked: 0 });
  });
  it("copes with a page the ledger does not know yet", () => {
    expect(ledgerFlags(undefined, undefined, NOW)).toMatchObject({ dropped: false, drops: 0 });
  });
});

describe("siteTrend", () => {
  const hist: { d: string; sites: Record<string, [number, number]> }[] = [
    { d: "2026-11-08", sites: { "a.com": [5, 20] } },
    { d: "2026-11-12", sites: { "a.com": [17, 40], "b.com": [20, 21] } },
    { d: "2026-11-15", sites: { "a.com": [30, 40], "b.com": [14, 23] } },
    { d: "2026-11-17", sites: { "a.com": [40, 44], "b.com": [10, 23] } },
  ];
  it("compares pages in Google now with the oldest check inside the last 7 days", () => {
    expect(siteTrend(hist, "a.com")).toEqual({ now: 40, then: 17, delta: 23, days: 5 });
    expect(siteTrend(hist, "b.com")).toEqual({ now: 10, then: 20, delta: -10, days: 5 });
  });
  it("says nothing with fewer than two checks", () => {
    expect(siteTrend(hist.slice(0, 1), "a.com")).toBeNull();
    expect(siteTrend(hist, "c.com")).toBeNull();
    expect(siteTrend(null, "a.com")).toBeNull();
  });
});
