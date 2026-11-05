import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { addAlerts, crawlStart, crawlTick, ranksRun, recordHealth, watchRuns } from "../worker/src/insights.js";

class KV {
  m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}
let env: { DATA: KV; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string; GITHUB_TOKEN?: string };
const read = async (k: string) => JSON.parse((await env.DATA.get(k)) || "null");
beforeEach(() => {
  env = { DATA: new KV() };
  vi.unstubAllGlobals();
});

const site = (indexedUrls: string[], urls: [string, string, string | null][] = []) => ({ property: "p", inspected: indexedUrls.length + urls.length, indexed: indexedUrls.length, notIndexed: urls.length, byState: {}, urls, indexedUrls });
const A = "https://x.test/a", B = "https://x.test/b", C = "https://x.test/c";

describe("alerts", () => {
  it("never saves the same alert id twice and keeps newest first", async () => {
    await addAlerts(env, [{ kind: "k", level: "bad", title: "one", id: "same" }]);
    await addAlerts(env, [{ kind: "k", level: "bad", title: "one again", id: "same" }, { kind: "k", level: "warn", title: "two", id: "other" }]);
    const list = await read("alerts");
    expect(list.map((a: { title: string }) => a.title)).toEqual(["two", "one"]);
  });
  it("pushes to Telegram only when it is configured", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await addAlerts(env, [{ kind: "k", level: "bad", title: "quiet", id: "1" }]);
    expect(f).not.toHaveBeenCalled();
    env.TELEGRAM_BOT_TOKEN = "T";
    env.TELEGRAM_CHAT_ID = "9";
    await addAlerts(env, [{ kind: "k", level: "bad", title: "loud", id: "2" }]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("api.telegram.org/botT/sendMessage");
  });
});

describe("recordHealth", () => {
  it("adds a history row per day and replaces the same day", async () => {
    await recordHealth(env, null, { "x.test": site([A, B], [[C, "n", null]]) }, "2026-11-05T01:00:00Z");
    await recordHealth(env, null, { "x.test": site([A], [[B, "n", null]]) }, "2026-11-05T09:00:00Z");
    await recordHealth(env, null, { "x.test": site([A, B, C]) }, "2026-11-06T01:00:00Z");
    expect((await read("history:index")).map((r: { d: string; sites: Record<string, number[]> }) => [r.d, r.sites["x.test"]])).toEqual([
      ["2026-11-05", [1, 2]],
      ["2026-11-06", [3, 3]],
    ]);
  });
  it("alerts when a page leaves Google and when new pages get in", async () => {
    const prior = { index: { "x.test": site([A, B]) } };
    await recordHealth(env, prior, { "x.test": site([A, C], [[B, "Crawled - currently not indexed", null]]) }, "2026-11-06T01:00:00Z");
    const list = await read("alerts");
    expect(list.map((a: { kind: string }) => a.kind).sort()).toEqual(["dropped", "indexed"]);
    expect(list.find((a: { kind: string }) => a.kind === "dropped").level).toBe("bad");
    expect(list.find((a: { kind: string }) => a.kind === "indexed").level).toBe("good");
  });
  it("does not call it a drop when Google could not be asked", async () => {
    const prior = { index: { "x.test": site([A, B]) } };
    await recordHealth(env, prior, { "x.test": site([A], [[B, "Could not inspect (429)", null]]) }, "2026-11-06T01:00:00Z");
    expect(await read("alerts")).toBeNull();
  });
  it("warns when a site returned no pages at all", async () => {
    await recordHealth(env, null, { "x.test": site([]) }, "2026-11-06T01:00:00Z");
    expect((await read("alerts"))[0].kind).toBe("health");
  });
});

/* A tiny fake site: / links to /ok, /missing, /old and a page that is not in the sitemap. */
const PAGES: Record<string, { status: number; body?: string; location?: string }> = {
  "https://x.test/": { status: 200, body: '<title>Home</title><a href="/ok">a</a><a href="/orphan">o</a><a href="/missing">m</a><a href="/logo.png">i</a><a href="https://other.test/z">e</a>' },
  "https://x.test/ok": { status: 200, body: "<title>Fine</title>" },
  "https://x.test/old": { status: 301, location: "/ok" },
  "https://x.test/missing": { status: 404 },
  "https://x.test/hidden": { status: 200, body: '<title>H</title><meta name="robots" content="noindex, follow">' },
  "https://x.test/untitled": { status: 200, body: "<html><body>hi</body></html>" },
  "https://x.test/orphan": { status: 200, body: "<title>Orphan</title>" },
};
const fakeSite = (input: RequestInfo | URL) => {
  const p = PAGES[String(input)];
  if (!p) return Promise.reject(new Error("no route"));
  const h = new Headers({ "content-type": "text/html" });
  if (p.location) h.set("location", p.location);
  return Promise.resolve(new Response(p.body ?? "", { status: p.status, headers: h }));
};
const hooks = {
  hosts: ["x.test"],
  sitemapUrlsFor: async () => ["https://x.test/", "https://x.test/ok", "https://x.test/old", "https://x.test/missing", "https://x.test/hidden", "https://x.test/untitled"],
  pool: async (tasks: (() => Promise<unknown>)[]) => Promise.all(tasks.map((t) => t())),
};

describe("site crawl", () => {
  it("finds broken, redirecting, noindex, untitled and orphan pages, and raises an alert for new broken ones", async () => {
    vi.stubGlobal("fetch", fakeSite);
    await crawlStart(env, "test");
    for (let i = 0; i < 6 && (await env.DATA.get("crawl:state")); i++) await crawlTick(env, hooks);
    expect(await env.DATA.get("crawl:state")).toBeNull();
    const f = await read("crawl:file");
    const s = f.sites["x.test"];
    // 6 sitemap pages + /orphan and /missing... but /missing is already in the sitemap, so only /orphan is extra
    expect(s.checked).toBe(7);
    const by = Object.fromEntries(s.issues.map((x: { url: string; kind: string }) => [x.url.replace("https://x.test", ""), x.kind]));
    expect(by).toEqual({ "/old": "redirect", "/missing": "broken", "/hidden": "noindex", "/untitled": "no-title", "/orphan": "not-in-sitemap" });
    expect(s.counts).toMatchObject({ broken: 1, redirect: 1, noindex: 1, "no-title": 1, "not-in-sitemap": 1 });
    expect((await read("alerts"))[0]).toMatchObject({ kind: "broken", level: "bad" });
  });
  it("does not repeat the alert when the same page is still broken", async () => {
    vi.stubGlobal("fetch", fakeSite);
    for (let run = 0; run < 2; run++) {
      await crawlStart(env, "test");
      for (let i = 0; i < 6 && (await env.DATA.get("crawl:state")); i++) await crawlTick(env, hooks);
    }
    expect(((await read("alerts")) as unknown[]).length).toBe(1);
  });
  it("reports a page that does not answer as broken", async () => {
    vi.stubGlobal("fetch", (u: RequestInfo | URL) => (String(u) === "https://x.test/ok" ? Promise.reject(new Error("timeout")) : fakeSite(u)));
    await crawlStart(env, "test");
    for (let i = 0; i < 6 && (await env.DATA.get("crawl:state")); i++) await crawlTick(env, hooks);
    const s = (await read("crawl:file")).sites["x.test"];
    expect(s.issues.find((x: { url: string }) => x.url.endsWith("/ok"))).toMatchObject({ kind: "broken", detail: "no answer" });
  });
});

describe("tracked phrases and traffic check", () => {
  const day = (n: number) => new Date(Date.now() - (n + 2) * 864e5).toISOString().slice(0, 10);
  it("stores a position series per phrase and swaps column order", async () => {
    const gsc = vi.fn(async (_e: unknown, _s: string, dates: { startDate: string }, dims: string[], _l: number, extra?: { dimensionFilterGroups: { filters: { expression: string }[] }[] }) => {
      if (dims[0] === "date" && extra) return { status: 200, rows: extra.dimensionFilterGroups[0].filters[0].expression === "streamlabs vs obs" ? [[day(1), 3, 40, 7.5, 11.2], [day(2), 2, 30, 6, 12.4], [day(3), 0, 0, 0, 0]] : [] };
      return { status: 200, rows: [[100, 1000, 10, 9]] };
    });
    await ranksRun(env, gsc);
    const f = await read("ranks:file");
    const kw = f.keywords.find((k: { kw: string }) => k.kw === "streamlabs vs obs");
    expect(kw.days).toEqual([[day(2), 12.4, 30, 2], [day(1), 11.2, 40, 3]].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)));
    expect(f.keywords.length).toBeGreaterThanOrEqual(8);
  });
  it("raises a traffic alert only on a real drop with enough volume", async () => {
    const mk = (cur: number, prev: number) => async (_e: unknown, _s: string, dates: { endDate: string }, dims: string[]) => {
      if (dims.length) return { status: 200, rows: [] };
      return { status: 200, rows: [[dates.endDate === day(0) ? cur : prev, 100, 1, 1]] };
    };
    await ranksRun(env, mk(50, 60)); // -17%: fine
    expect(await read("alerts")).toBeNull();
    await ranksRun(env, mk(5, 60)); // -92%: alert
    expect((await read("alerts"))[0]).toMatchObject({ kind: "traffic", level: "bad" });
  });
  it("ignores a drop from a tiny base", async () => {
    await ranksRun(env, async (_e: unknown, _s: string, dates: { endDate: string }, dims: string[]) => (dims.length ? { status: 200, rows: [] } : { status: 200, rows: [[dates.endDate === day(0) ? 0 : 5, 1, 0, 1]] }));
    expect(await read("alerts")).toBeNull();
  });
});

describe("failed workflow watch", () => {
  const run = (id: number, path: string, conclusion: string, ageH = 2) => ({ id, path, name: path.split("/").pop(), conclusion, created_at: new Date(Date.now() - ageH * 3600e3).toISOString(), display_title: "msg" });
  it("alerts once for a workflow whose latest run failed, not for one that has since passed", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ workflow_runs: [run(3, ".github/workflows/a.yml", "failure"), run(2, ".github/workflows/b.yml", "success"), run(1, ".github/workflows/b.yml", "failure")] })));
    expect(await watchRuns(env, ["o/r"])).toBe(1);
    expect(await watchRuns(env, ["o/r"])).toBe(0); // same run: not repeated
    expect((await read("alerts"))[0]).toMatchObject({ kind: "workflow", level: "bad" });
  });
  it("ignores old failures and repos it cannot read", async () => {
    vi.stubGlobal("fetch", async (u: RequestInfo | URL) => (String(u).includes("/o/gone/") ? new Response("no", { status: 404 }) : new Response(JSON.stringify({ workflow_runs: [run(9, ".github/workflows/a.yml", "failure", 50)] }))));
    expect(await watchRuns(env, ["o/gone", "o/r"])).toBe(0);
  });
});
