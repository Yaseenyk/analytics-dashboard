import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { applyReplace, classify, extractText, judge, locate, newNumbers, pageTitle, pickCandidates } from "../scripts/optimizer.mjs";

const row = (o: Partial<{ host: string; q: string; page: string; clicks: number; impr: number; ctr: number; pos: number; status: string }>) => ({ q: "obs settings", page: "https://streamerosai.com/blog/a", clicks: 2, impr: 100, ctr: 2, pos: 8, status: "near", ...o });

describe("classify", () => {
  it("buckets by position, and needs impressions to say anything", () => {
    expect(classify(2, 50)).toBe("top");
    expect(classify(8, 50)).toBe("near");
    expect(classify(35, 50)).toBe("far");
    expect(classify(8, 3)).toBe("low");
  });
});

describe("pickCandidates", () => {
  const kw = { sites: { "streamerosai.com": { rows: [row({ page: "/a", impr: 500, ctr: 0.5 }), row({ page: "/b", impr: 300 }), row({ page: "/c", impr: 200 }), row({ page: "/d", impr: 50, status: "top" }), row({ page: "/e", impr: 5 })] }, "yk.streamerosai.com": { rows: [row({ page: "/p", impr: 400 })] } } };
  it("takes near rows first, then far, capped per site, never top pages", () => {
    const c = pickCandidates(kw, [], { maxChanges: 5, maxPerSite: 2 });
    expect(c.map((x: { page: string }) => x.page)).toEqual(["/a", "/p", "/b"]);
    const far = pickCandidates({ sites: { s: { rows: [row({ page: "/far", status: "far", pos: 30, impr: 40 }), row({ page: "/near", impr: 15 })] } } }, [], { maxPerSite: 5 });
    expect(far.map((x: { page: string }) => x.page)).toEqual(["/near", "/far"]);
  });
  it("adds not-indexed pages from the index check after the ranked ones, and skips recent reports", () => {
    const health = { index: { s: { urls: [["https://s/x", "Crawled - currently not indexed", null], ["https://s/y", "Discovered - currently not indexed", null], ["https://s/z", "URL is unknown to Google", null]] } } };
    const c = pickCandidates({ sites: { s: { rows: [row({ host: "s", page: "https://s/a" })] } } }, [], { maxPerSite: 5 }, health);
    expect(c.map((x: { page: string; kind: string }) => [x.page, x.kind])).toEqual([["https://s/a", "rank"], ["https://s/x", "index"], ["https://s/y", "index"]]);
    const again = pickCandidates({ sites: {} }, [{ page: "https://s/x", status: "report", created: new Date().toISOString().slice(0, 10) }], { maxPerSite: 5 }, health);
    expect(again.map((x: { page: string }) => x.page)).toEqual(["https://s/y"]);
  });
  it("judges an index experiment by whether the page got in", () => {
    const exp = { kind: "index", baseline: {}, created: "2026-11-01", liveSince: "2026-11-10" };
    expect(judge(exp, null, "2026-12-10", true)?.verdict).toBe("better");
    expect(judge(exp, null, "2026-12-10", false)).toBeNull();
    expect(judge(exp, null, "2027-02-01", false)?.verdict).toBe("inconclusive");
  });
  it("skips pages with an open experiment and one page is one candidate", () => {
    const c = pickCandidates({ sites: { s: { rows: [row({ page: "/a", q: "x" }), row({ page: "/a", q: "y", impr: 90 })] } } }, [{ page: "/b", status: "live" }], { maxChanges: 5 });
    expect(c).toHaveLength(1);
    expect(pickCandidates({ sites: { s: { rows: [row({ page: "/a" })] } } }, [{ page: "/a", status: "proposed" }])).toEqual([]);
  });
});

describe("judge", () => {
  const exp = { baseline: { pos: 9, ctr: 1, impr: 100, clicks: 1 }, created: "2026-11-01", liveSince: "2026-11-10" };
  it("calls a real move up better, a real move down worse, small moves the same", () => {
    expect(judge(exp, row({ pos: 6, ctr: 1.2 }), "2026-12-10")?.verdict).toBe("better");
    expect(judge(exp, row({ pos: 12, ctr: 0.8 }), "2026-12-10")?.verdict).toBe("worse");
    expect(judge(exp, row({ pos: 9.4, ctr: 1.1 }), "2026-12-10")?.verdict).toBe("same");
  });
  it("waits when there is too little data, and gives up after ten weeks with no row", () => {
    expect(judge(exp, row({ impr: 4 }), "2026-12-10")).toBeNull();
    expect(judge(exp, undefined, "2026-12-10")).toBeNull();
    expect(judge(exp, undefined, "2027-02-01")?.verdict).toBe("inconclusive");
  });
});

describe("edits", () => {
  it("applyReplace only touches text that occurs exactly once", () => {
    expect(applyReplace("title: A\nx: A", "A", "B").ok).toBe(false);
    expect(applyReplace("title: A\nx: C", "A", "B")).toEqual({ ok: true, text: "title: B\nx: C" });
    expect(applyReplace("none", "A", "B").ok).toBe(false);
  });
  it("locate finds the single file with the single occurrence", () => {
    const fsys: Record<string, string> = { a: "hello world", b: "nothing", c: "hello hello" };
    const read = (f: string) => fsys[f];
    expect(locate(["a", "b"], "hello", read)).toBe("a");
    expect(locate(["a", "c"], "hello", read)).toBeNull(); // two files
    expect(locate(["c"], "hello", read)).toBeNull(); // twice in one file
  });
  it("newNumbers flags figures the page did not have, ignoring years", () => {
    expect(newNumbers("Costs 1,200 rupees in 2026 for 3 kW", "a 3 kW system from 2024")).toEqual(["1,200"]);
    expect(newNumbers("no digits here", "anything")).toEqual([]);
  });
});

describe("page text", () => {
  it("drops chrome and scripts, keeps headings and text", () => {
    const html = "<html><head><title>T · Site</title><script>x()</script></head><body><nav>menu</nav><h2>Why</h2><p>Because &amp; so.</p><footer>f</footer></body></html>";
    expect(extractText(html)).toBe("## Why\nBecause & so.");
    expect(pageTitle(html)).toBe("T · Site");
  });
});
