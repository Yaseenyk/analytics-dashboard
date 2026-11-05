import { describe, expect, it } from "vitest";
import { buildReview } from "@/lib/review";
import type { HealthFile } from "@/lib/types";

const HOST = "solar.streamerosai.com";
const U = (p: string) => `https://${HOST}${p}`;
const file = (over: Partial<HealthFile["index"][string]> = {}): HealthFile => ({
  generatedAt: "2026-11-05T00:00:00Z",
  indexAt: "2026-11-05T00:00:00Z",
  index: {
    [HOST]: {
      property: `https://${HOST}/`,
      inspected: 3,
      indexed: 1,
      notIndexed: 2,
      byState: {},
      urls: [
        [U("/a"), "Discovered - currently not indexed", null],
        [U("/b"), "URL is unknown to Google", "2026-11-01"],
      ],
      indexedUrls: [U("/c")],
      ...over,
    },
  },
});

describe("buildReview", () => {
  it("lists every not-indexed page when nothing was copied", () => {
    const v = buildReview(file(), [HOST], {});
    expect(v.notIn[0].rows.map((r) => r[0])).toEqual([U("/a"), U("/b")]);
    expect(v.under).toEqual([]);
    expect(v.done).toEqual([]);
    expect(v.hasIdx).toBe(true);
  });
  it("moves a copied page out of the list and into Under review", () => {
    const v = buildReview(file(), [HOST], { [U("/a")]: { at: "2026-11-04T10:00:00Z", host: HOST } });
    expect(v.notIn[0].rows.map((r) => r[0])).toEqual([U("/b")]);
    expect(v.under).toHaveLength(1);
    expect(v.under[0]).toMatchObject({ url: U("/a"), status: "Discovered - currently not indexed" });
  });
  it("shows a copied page as Indexed once Google reports it indexed", () => {
    const v = buildReview(file(), [HOST], { [U("/c")]: { at: "2026-11-03T10:00:00Z", host: HOST } });
    expect(v.done.map((d) => d.url)).toEqual([U("/c")]);
    expect(v.under).toEqual([]);
  });
  it("keeps a copied page under review when it is in neither list (not checked yet)", () => {
    const v = buildReview(file(), [HOST], { [U("/new")]: { at: "2026-11-04T10:00:00Z", host: HOST } });
    expect(v.under[0].status).toBe("Waiting for the next check");
  });
  it("cannot mark anything indexed from an older file without the indexed list", () => {
    const v = buildReview(file({ indexedUrls: undefined }), [HOST], { [U("/c")]: { at: "2026-11-03T10:00:00Z", host: HOST } });
    expect(v.hasIdx).toBe(false);
    expect(v.done).toEqual([]);
    expect(v.under).toHaveLength(1);
  });
  it("only shows pages of the chosen site", () => {
    const v = buildReview(file(), ["streamerosai.com"], { [U("/a")]: { at: "2026-11-04T10:00:00Z", host: HOST } });
    expect(v.notIn).toEqual([]);
    expect(v.under).toEqual([]);
  });
  it("sorts Under review oldest first", () => {
    const v = buildReview(file(), [HOST], {
      [U("/b")]: { at: "2026-11-04T12:00:00Z", host: HOST },
      [U("/a")]: { at: "2026-11-02T12:00:00Z", host: HOST },
    });
    expect(v.under.map((u) => u.url)).toEqual([U("/a"), U("/b")]);
  });
});
