import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { LIMITS, buildLinksFile, diffDomains, domainOf, fetchAllLinks, fetchSiteLinks, pickBaseline, summarizeSite } from "../scripts/links.mjs";
import { STATE_TEXT, firstCompare, linkRows, linkTotals, lostLinks, newLinks, pathOf, safeHref, siteTop } from "@/lib/links";
import type { LinksFile } from "@/lib/types";

type Res = { status: number; rows: unknown[]; detail?: string };
const ok = (d: unknown): Res => ({ status: 200, rows: [d] });

/** A fake Bing: link counts and linking URLs per site, with a log of every call. */
function fakeBing(data: Record<string, { counts: { Url: string; Count: number }[][]; links?: Record<string, { Url: string; AnchorText?: string }[][]>; fail?: number; detail?: string }>) {
  const calls: string[] = [];
  const get = async (method: string, p: Record<string, string>): Promise<Res> => {
    calls.push(`${method} ${p.siteUrl} ${p.link ?? ""} ${p.page}`);
    const s = data[p.siteUrl];
    if (!s) return { status: 404, rows: [] };
    if (s.fail) return { status: s.fail, rows: [], detail: s.detail };
    if (method === "GetLinkCounts") return ok({ Links: s.counts[+p.page] ?? [], TotalPages: s.counts.length });
    const pages = s.links?.[p.link] ?? [];
    return ok({ Details: pages[+p.page] ?? [], TotalPages: pages.length });
  };
  return { get, calls };
}

describe("domainOf", () => {
  it("lowercases, strips www and rejects junk", () => {
    expect(domainOf("https://WWW.Example.com/a?b=1")).toBe("example.com");
    expect(domainOf("http://blog.dev.to/x")).toBe("blog.dev.to");
    expect(domainOf("not a url")).toBe("");
    expect(domainOf(undefined)).toBe("");
  });
});

describe("summarizeSite (aggregation per site)", () => {
  it("sums links, ranks pages and counts linking domains, leaving our own sites out", () => {
    const s = summarizeSite(
      [{ Url: "https://a.test/x", Count: 3 }, { Url: "https://a.test/", Count: 7 }, { Url: "", Count: 9 }],
      {
        "https://a.test/": [{ Url: "https://www.dev.to/p1" }, { Url: "https://dev.to/p2" }, { Url: "https://yk.streamerosai.com/" }],
        "https://a.test/x": [{ Url: "https://reddit.com/r/x" }, { Url: "garbage" }],
      },
    );
    expect(s.status).toBe("ok");
    expect(s.links).toBe(10);
    expect(s.pagesWithLinks).toBe(2);
    expect(s.pages[0]).toEqual(["https://a.test/", 7]);
    expect(s.domains).toEqual([["dev.to", 2], ["reddit.com", 1]]);
    expect(s.examples["dev.to"]).toEqual(["https://www.dev.to/p1", "https://a.test/"]);
    expect(s.examples["streamerosai.com"]).toBeUndefined();
  });
  it("is empty but valid when Bing has no links", () => {
    const s = summarizeSite([], {});
    expect(s).toMatchObject({ status: "ok", links: 0, pagesWithLinks: 0, domains: [], pages: [] });
  });
});

describe("fetchSiteLinks / fetchAllLinks (paging, quota, errors)", () => {
  it("pages through link counts and opens only the top pages", async () => {
    const counts = [Array.from({ length: 12 }, (_, i) => ({ Url: `https://a.test/p${i}`, Count: 20 - i }))];
    const links = { "https://a.test/p0": [[{ Url: "https://one.test/a" }], [{ Url: "https://two.test/b" }]] };
    const { get, calls } = fakeBing({ "https://a.test/": { counts, links } });
    const budget = { left: 100, stopped: null };
    const s = await fetchSiteLinks(get, "https://a.test/", budget);
    expect(s.domains.map((d: [string, number]) => d[0]).sort()).toEqual(["one.test", "two.test"]);
    expect(calls.filter((c) => c.startsWith("GetUrlLinks")).length).toBeLessThanOrEqual(LIMITS.topPages * LIMITS.linkPages);
    expect(s.partial).toBe(true); // 12 linked pages, only the top 10 opened
  });
  it("stops at the page limit for link counts", async () => {
    const counts = Array.from({ length: 9 }, (_, i) => [{ Url: `https://a.test/q${i}`, Count: 1 }]);
    const { get, calls } = fakeBing({ "https://a.test/": { counts } });
    const s = await fetchSiteLinks(get, "https://a.test/", { left: 100, stopped: null });
    expect(calls.filter((c) => c.startsWith("GetLinkCounts")).length).toBe(LIMITS.countPages);
    expect(s.partial).toBe(true);
  });
  it("marks a failing site as an error and keeps going with the next one", async () => {
    const { get } = fakeBing({
      "https://bad.test/": { counts: [], fail: 500, detail: "boom" },
      "https://good.test/": { counts: [[{ Url: "https://good.test/", Count: 2 }]], links: { "https://good.test/": [[{ Url: "https://x.test/" }]] } },
    });
    const r = await fetchAllLinks(get, [{ Url: "https://bad.test/" }, { Url: "https://good.test/" }, { Url: "https://new.test/", IsVerified: false }]);
    expect(r.sites["bad.test"]).toMatchObject({ status: "error" });
    expect(r.sites["bad.test"].error).toContain("500");
    expect(r.sites["good.test"]).toMatchObject({ status: "ok", links: 2 });
    expect(r.unverified).toEqual(["new.test"]);
    expect(r.verified).toEqual(["bad.test", "good.test"]);
    expect(r.sites["new.test"]).toBeUndefined();
  });
  it("stops every later call when Bing reports the quota is used up", async () => {
    const { get, calls } = fakeBing({
      "https://a.test/": { counts: [], fail: 400, detail: "ThrottleUser: quota exceeded" },
      "https://b.test/": { counts: [[{ Url: "https://b.test/", Count: 1 }]] },
    });
    const r = await fetchAllLinks(get, [{ Url: "https://a.test/" }, { Url: "https://b.test/" }]);
    expect(r.stopped).toMatch(/quota/);
    expect(r.sites["b.test"].status).toBe("skipped");
    expect(calls.length).toBe(1);
  });
  it("gives up after three timeouts in a row", async () => {
    let n = 0;
    const get = async () => { n++; return { status: 599, rows: [], detail: "timeout" }; };
    const r = await fetchAllLinks(get, ["a", "b", "c", "d", "e"].map((x) => ({ Url: `https://${x}.test/` })));
    expect(n).toBe(3);
    expect(r.stopped).toMatch(/stopped answering/);
  });
});

describe("snapshot diffing (new and lost)", () => {
  const hist = [
    { date: "2026-11-10", sites: {} },
    { date: "2026-11-16", sites: { "a.test": ["dev.to", "old.test"] } },
    { date: "2026-11-20", sites: {} },
    { date: "2026-11-24", sites: {} },
  ];
  it("compares with the newest snapshot at least 7 days old", () => {
    expect(pickBaseline(hist, "2026-11-24")?.date).toBe("2026-11-16");
    expect(pickBaseline(hist, "2026-11-23")?.date).toBe("2026-11-16");
    expect(pickBaseline(hist, "2026-11-22")?.date).toBe("2026-11-10");
  });
  it("falls back to the oldest earlier snapshot, and to none on the first day", () => {
    expect(pickBaseline([{ date: "2026-11-22", sites: {} }], "2026-11-24")?.date).toBe("2026-11-22");
    expect(pickBaseline([{ date: "2026-11-24", sites: {} }], "2026-11-24")).toBeNull();
    expect(pickBaseline([], "2026-11-24")).toBeNull();
    expect(pickBaseline(undefined, "2026-11-24")).toBeNull();
  });
  it("lists new domains with their example link, and lost ones", () => {
    const site = { status: "ok", domains: [["dev.to", 2], ["new.test", 1]], examples: { "new.test": ["https://new.test/post", "https://a.test/"] } };
    expect(diffDomains(site, ["dev.to", "old.test"])).toEqual({ new: [["new.test", "https://new.test/post", "https://a.test/"]], lost: ["old.test"] });
  });
  it("does not diff a failed site or one with no earlier snapshot", () => {
    expect(diffDomains({ status: "error" }, ["x"])).toBeNull();
    expect(diffDomains({ status: "ok", domains: [] }, undefined)).toBeNull();
  });
});

describe("buildLinksFile", () => {
  const fetched = {
    sites: { "a.test": { status: "ok", links: 3, domains: [["dev.to", 2], ["new.test", 1]], examples: { "new.test": ["https://new.test/p", "https://a.test/"] }, pages: [] }, "b.test": { status: "error", error: "Bing returned 500" } },
    verified: ["a.test", "b.test"], unverified: [], stopped: null, calls: 4,
  };
  it("adds today's snapshot, replaces a same-day one, keeps a small history and diffs against a week ago", () => {
    const prev = { history: [{ date: "2026-11-16", sites: { "a.test": ["dev.to", "gone.test"] } }, { date: "2026-11-24", sites: { "a.test": ["zzz"] } }, ...Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, sites: {} }))] };
    const f = buildLinksFile({ fetched, prev, now: new Date("2026-11-24T03:15:00Z") });
    expect(f.history.length).toBe(LIMITS.history);
    expect(f.history.filter((h: { date: string }) => h.date === "2026-11-24")).toEqual([{ date: "2026-11-24", sites: { "a.test": ["dev.to", "new.test"] } }]);
    expect(f.since).toBe("2026-11-16");
    expect(f.week["a.test"]).toEqual({ since: "2026-11-16", new: [["new.test", "https://new.test/p", "https://a.test/"]], lost: ["gone.test"] });
    expect(f.week["b.test"]).toBeUndefined();
    expect(f.error).toBeNull();
  });
  it("on the first run has no comparison (nothing is called new)", () => {
    const f = buildLinksFile({ fetched, prev: null, now: new Date("2026-11-24T03:00:00Z") });
    expect(f.since).toBeNull();
    expect(f.week).toEqual({});
    expect(f.history).toHaveLength(1);
  });
  it("keeps the old snapshot and says why when Bing cannot be read at all", () => {
    const prev = { generatedAt: "2026-11-23T03:00:00.000Z", sites: { "a.test": { status: "ok" } }, history: [{ date: "2026-11-23", sites: {} }] };
    const f = buildLinksFile({ fetched: null, prev, error: "BING_API_KEY is not set", now: new Date("2026-11-24T03:00:00Z") });
    expect(f.error).toBe("BING_API_KEY is not set");
    expect(f.generatedAt).toBe("2026-11-23T03:00:00.000Z");
    expect(f.history).toHaveLength(1);
    const empty = buildLinksFile({ fetched: null, prev: null, error: "x" });
    expect(empty).toMatchObject({ sites: {}, week: {}, history: [], error: "x", source: "bing" });
  });
});

describe("UI data shaping", () => {
  const file: LinksFile = {
    generatedAt: "2026-11-24T03:00:00Z",
    source: "bing",
    verified: ["yk.streamerosai.com", "tools.streamerosai.com", "math.streamerosai.com", "calc.streamerosai.com"],
    unverified: [],
    sites: {
      "yk.streamerosai.com": { status: "ok", links: 9, domains: [["dev.to", 5], ["github.com", 4]], pages: [["https://yk.streamerosai.com/blog/a", 6]], partial: true },
      "tools.streamerosai.com": { status: "ok", links: 2, domains: [["reddit.com", 2]], pages: [] },
      "math.streamerosai.com": { status: "ok", links: 0, domains: [], pages: [] },
      "calc.streamerosai.com": { status: "error", error: "Bing returned 500" },
    },
    since: "2026-11-17",
    week: {
      "yk.streamerosai.com": { since: "2026-11-17", new: [["github.com", "https://github.com/x", "https://yk.streamerosai.com/"]], lost: ["old.test"] },
      "tools.streamerosai.com": { since: "2026-11-17", new: [], lost: [] },
    },
    history: [{ date: "2026-11-10", sites: {} }, { date: "2026-11-24", sites: {} }],
  };
  it("gives every site a row with the right state, sites with links first", () => {
    const rows = linkRows(file, "all");
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({ h: "yk.streamerosai.com", state: "ok", domains: 2, links: 9, fresh: 1, lost: 1, partial: true });
    expect(rows[1]).toMatchObject({ h: "tools.streamerosai.com", fresh: 0 });
    expect(rows.find((r) => r.h === "math.streamerosai.com")).toMatchObject({ state: "none", fresh: null });
    expect(rows.find((r) => r.h === "calc.streamerosai.com")).toMatchObject({ state: "error", why: "Bing returned 500" });
    expect(rows.find((r) => r.h === "sable.streamerosai.com")?.state).toBe("unverified");
    expect(STATE_TEXT.none).toBe("Bing has not found links to this site yet");
    expect(STATE_TEXT.unverified).toBe("Site not verified in Bing");
  });
  it("totals the rows and knows whether a comparison exists", () => {
    expect(linkTotals(linkRows(file, "all"))).toEqual({ domains: 3, links: 11, fresh: 1, lost: 1, sites: 2, compared: true });
    expect(linkTotals([]).compared).toBe(false);
  });
  it("filters to one site, and lists new and lost domains", () => {
    expect(linkRows(file, "tools.streamerosai.com")).toHaveLength(1);
    expect(newLinks(file, "all")).toEqual([{ h: "yk.streamerosai.com", name: "Portfolio", domain: "github.com", from: "https://github.com/x", to: "https://yk.streamerosai.com/" }]);
    expect(newLinks(file, "tools.streamerosai.com")).toEqual([]);
    expect(lostLinks(file, "all")).toEqual([{ h: "yk.streamerosai.com", name: "Portfolio", domain: "old.test" }]);
    expect(siteTop(file, "yk.streamerosai.com").pages).toEqual([["/blog/a", 6]]);
    expect(siteTop(file, "all")).toEqual({ domains: [], pages: [] });
  });
  it("handles a missing file, a failed Bing call and odd URLs", () => {
    expect(linkRows(null, "all")).toEqual([]);
    expect(newLinks(undefined, "all")).toEqual([]);
    const failed: LinksFile = { generatedAt: "", source: "bing", sites: {}, error: "BING_API_KEY is not set" };
    expect(linkRows(failed, "all").every((r) => r.state === "error" && r.why === "BING_API_KEY is not set")).toBe(true);
    expect(pathOf("https://a.test/x?y=1")).toBe("/x?y=1");
    expect(pathOf("nope")).toBe("nope");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("https://ok.test/")).toBe("https://ok.test/");
    expect(firstCompare(file)).toBe("2026-11-17");
    expect(firstCompare(null)).toBeNull();
  });
});
