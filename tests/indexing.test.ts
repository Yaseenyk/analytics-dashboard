import { describe, expect, it } from "vitest";
import { isFailed, isReal, splitAll, splitIndex } from "@/lib/indexing";
import type { HealthSite } from "@/lib/types";

const site = (byState: Record<string, number>): HealthSite =>
  ({ inspected: Object.values(byState).reduce((a, b) => a + b, 0), indexed: byState["Submitted and indexed"] ?? 0, byState }) as unknown as HealthSite;

describe("index split", () => {
  it("does not count a failed check as not indexed", () => {
    // 20 Nov 2026: Google's inspection API timed out during the daily check and
    // 103 pages came back "Could not inspect (598)"; they were shown as not indexed.
    const s = splitIndex(site({
      "Submitted and indexed": 10,
      "Could not inspect (598)": 5,
      "Discovered - currently not indexed": 2,
      "Excluded by “noindex” tag": 3,
      "New page: Google has not checked it yet": 1,
    }));
    expect(s).toMatchObject({ indexed: 10, failed: 5, real: 2, onPurpose: 3, waiting: 1, checked: 21 });
  });

  it("sums failed checks across sites", () => {
    const all = splitAll([site({ "Could not inspect (598)": 2 }), site({ "Could not inspect (500)": 1, "Crawled - currently not indexed": 4 })]);
    expect(all.failed).toBe(3);
    expect(all.real).toBe(4);
  });

  it("keeps failed checks out of the not-indexed list", () => {
    expect(isFailed("Could not inspect (598)")).toBe(true);
    expect(isReal("Could not inspect (598)")).toBe(false);
    expect(isReal("Crawled - currently not indexed")).toBe(true);
  });
});

describe("failed checks in the Worker", () => {
  it("falls back to the page's last known answer", async () => {
    // @ts-expect-error plain JavaScript Worker, no type declarations
    const { lastKnown } = await import("../worker/src/index.js");
    const before = { index: { "a.com": { indexedUrls: ["https://a.com/in/"], urls: [["https://a.com/out/", "Discovered - currently not indexed", "2026-11-01"], ["https://a.com/err/", "Could not inspect (598)", null]] } } };
    const fail = (u: string) => [u, "Could not inspect (598)", "ERROR", null];
    expect(lastKnown(before, "a.com", fail("https://a.com/in/"))).toEqual(["https://a.com/in/", "Submitted and indexed", "PASS", null]);
    expect(lastKnown(before, "a.com", fail("https://a.com/out/"))).toEqual(["https://a.com/out/", "Discovered - currently not indexed", "NEUTRAL", "2026-11-01"]);
    // No usable earlier answer: it stays a failed check (and is left out of counts and the chart).
    expect(lastKnown(before, "a.com", fail("https://a.com/err/"))[2]).toBe("ERROR");
    expect(lastKnown(null, "a.com", fail("https://a.com/new/"))[2]).toBe("ERROR");
  });
});
