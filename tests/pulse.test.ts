import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript Worker, no type declarations
import worker from "../pulse/src/index.js";
// @ts-expect-error plain JavaScript, no type declarations
import { classifyRef, clean, ingest, insights, isDatacenter, uaInfo } from "../pulse/src/lib.js";
// @ts-expect-error plain JavaScript, no type declarations
import { TRACKER } from "../pulse/src/tracker.js";

/* The pulse Worker run against a real SQLite database standing in for D1. node:sqlite is loaded with require because Vite does not know that built-in yet. */
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = readFileSync(new URL("../pulse/schema.sql", import.meta.url), "utf8");

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  return {
    db,
    prepare(sql: string) {
      let args: unknown[] = [];
      const st = {
        bind(...a: unknown[]) { args = a; return st; },
        async all() { return { results: db.prepare(sql).all(...(args as never[])) }; },
        _run() { return db.prepare(sql).run(...(args as never[])); },
      };
      return st;
    },
    async batch(stmts: { _run(): unknown }[]) {
      db.exec("BEGIN");
      try { for (const s of stmts) s._run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
let ipn = 0;
function post(msg: unknown, over: { ua?: string; origin?: string | null; cf?: object; raw?: string } = {}) {
  const headers: Record<string, string> = { "User-Agent": over.ua ?? CHROME, "CF-Connecting-IP": `10.0.0.${++ipn}` };
  if (over.origin !== null) headers.Origin = over.origin ?? "https://calc.streamerosai.com";
  const req = new Request("https://pulse.test/e", { method: "POST", body: over.raw ?? JSON.stringify(msg), headers });
  Object.defineProperty(req, "cf", { value: over.cf ?? { country: "IN", asOrganization: "Reliance Jio", asn: 55836 } });
  return req;
}
const msg = (o: object = {}) => ({ v: 1, s: "calc.streamerosai.com", i: "hit00000001", u: "sess0000001", p: "/emi-calculator/", r: "", m: "||", w: 1280, h: 720, l: "en-IN", hu: 0, a: 0, sc: 0, nc: 0, c: [], ...o });
const rows = (d: ReturnType<typeof fakeD1>, sql: string) => d.db.prepare(sql).all() as Record<string, unknown>[];

describe("classification", () => {
  it("reads browsers, systems and devices, and flags robots", () => {
    expect(uaInfo(CHROME)).toMatchObject({ bot: false, device: "desktop", browser: "Chrome", os: "Windows" });
    expect(uaInfo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toMatchObject({ bot: false, device: "mobile", browser: "Safari", os: "iOS" });
    expect(uaInfo("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)").bot).toBe(true);
    expect(uaInfo("python-requests/2.31").bot).toBe(true);
    expect(uaInfo(CHROME.replace("Chrome/124.0", "HeadlessChrome/124.0")).bot).toBe(true);
    expect(uaInfo("").bot).toBe(true);
  });

  it("does not call a real phone or an in-app browser a robot", () => {
    // a phone brand with "bot" in its name, and the browsers inside the Facebook, Instagram and LinkedIn apps
    expect(uaInfo("Mozilla/5.0 (Linux; Android 13; CUBOT NOTE 21) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36").bot).toBe(false);
    expect(uaInfo("Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/446.0.0.34.118;]").bot).toBe(false);
    expect(uaInfo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.19.113 (iPhone14,5; iOS 17_2; en_IN; en-IN; scale=3.00; 1170x2532; 548339486)").bot).toBe(false);
    expect(uaInfo("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.178 Mobile Safari/537.36 [LinkedInApp]/4.1.901").bot).toBe(false);
    expect(uaInfo("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)").bot).toBe(true);
    expect(uaInfo("meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)").bot).toBe(true);
  });

  it("recognises hosting networks but not home or phone networks", () => {
    expect(isDatacenter("Amazon.com, Inc.", 16509)).toBe(true);
    expect(isDatacenter("Hetzner Online GmbH", 24940)).toBe(true);
    expect(isDatacenter("Reliance Jio Infocomm Limited", 55836)).toBe(false);
    expect(isDatacenter("Bharti Airtel Ltd.", 24560)).toBe(false);
    expect(isDatacenter("Cloudflare, Inc.", 13335)).toBe(false);
  });

  it("sorts where a visitor came from", () => {
    expect(classifyRef("", "calc.streamerosai.com", "", "")).toBe("direct");
    expect(classifyRef("calc.streamerosai.com", "calc.streamerosai.com", "", "")).toBe("internal");
    expect(classifyRef("yk.streamerosai.com", "calc.streamerosai.com", "", "")).toBe("own");
    expect(classifyRef("google.com", "calc.streamerosai.com", "", "")).toBe("search");
    expect(classifyRef("gemini.google.com", "calc.streamerosai.com", "", "")).toBe("ai");
    expect(classifyRef("chatgpt.com", "calc.streamerosai.com", "", "")).toBe("ai");
    expect(classifyRef("lnkd.in", "calc.streamerosai.com", "", "")).toBe("social");
    expect(classifyRef("example.org", "calc.streamerosai.com", "", "")).toBe("other");
    // LinkedIn's app strips the referrer, so the utm_source the bot adds is what identifies it
    expect(classifyRef("", "calc.streamerosai.com", "linkedin", "social")).toBe("social");
    expect(classifyRef("", "calc.streamerosai.com", "news", "email")).toBe("email");
  });
});

describe("clean", () => {
  it("accepts a good message and trims the path and referrer to what is safe to keep", () => {
    const c = clean(msg({ p: "/a/b/?token=secret#x", r: "https://www.reddit.com/r/x/?utm=1" }));
    expect(c).toMatchObject({ path: "/a/b/", refHost: "reddit.com", refPath: "/r/x/" });
    expect(JSON.stringify(c)).not.toContain("secret");
  });

  it("rejects other versions, unknown sites, bad ids and paths that are not paths", () => {
    expect(clean({ ...msg(), v: 2 })).toBeNull();
    expect(clean(msg({ s: "evil.example.com" }))).toBeNull();
    expect(clean(msg({ i: "short" }))).toBeNull();
    expect(clean(msg({ u: "UPPER-CASE-ID" }))).toBeNull();
    expect(clean(msg({ p: "no-slash" }))).toBeNull();
    expect(clean(null)).toBeNull();
  });

  it("keeps download clicks as their own kind", () => {
    const c = clean(msg({ c: [{ n: 1, t: 9, k: "dl", l: "Get the guide", h: "guide.pdf", x: 10, y: 10, g: "main", z: 0 }] }))!.clicks[0];
    expect(c).toMatchObject({ k: "dl", h: "guide.pdf" });
  });

  it("limits click fields, unknown kinds fall back to other, and the list is capped at 30", () => {
    const many = Array.from({ length: 50 }, (_, n) => ({ n: n + 1, t: 5, k: "link", l: "x", h: "/p", x: 50, y: 10, g: "nav", z: 0 }));
    expect(clean(msg({ c: many }))!.clicks).toHaveLength(30);
    const c = clean(msg({ c: [{ n: 1, t: 9, k: "hack", l: "a".repeat(200), h: "/p?email=a@b.c", x: 400, y: -5, g: "", z: 1 }] }))!.clicks[0];
    expect(c).toMatchObject({ k: "other", x: 100, y: 0, z: 1, h: "/p" });
    expect(c.l.length).toBe(40);
  });
});

describe("ingest", () => {
  it("creates a visit, then updates the same one without losing a human signal", async () => {
    const env = { DB: fakeD1() };
    await ingest(post(msg()), env);
    await ingest(post(msg({ hu: 1, a: 12, sc: 60, nc: 2 })), env);
    await ingest(post(msg({ hu: 0, a: 3, sc: 20 })), env);
    const r = rows(env.DB, "SELECT * FROM hits");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ site: "calc.streamerosai.com", path: "/emi-calculator/", human: 1, active: 12, scroll: 60, clicks: 2, country: "IN", browser: "Chrome", os: "Windows", device: "desktop", dc: 0, bot: 0 });
  });

  it("tells a campaign tag from a referring website, and shows the tag when there is no referrer", async () => {
    const env = { DB: fakeD1() };
    await ingest(post(msg({ m: "linkedin|social|launch" })), env);
    expect(rows(env.DB, "SELECT ref_kind, ref_host, utm_medium FROM hits")).toEqual([{ ref_kind: "social", ref_host: "linkedin", utm_medium: "social" }]);
  });

  it("stores each click once even if the same batch is sent twice", async () => {
    const env = { DB: fakeD1() };
    const c = { n: 1, t: 1500, k: "link", l: "EMI", h: "/emi-calculator/", x: 40, y: 520, g: "nav", z: 0 };
    await ingest(post(msg({ c: [c] })), env);
    await ingest(post(msg({ c: [c] })), env);
    const r = rows(env.DB, "SELECT * FROM clicks");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "link", label: "EMI", href: "/emi-calculator/", x: 40, y: 520, sec: "nav", site: "calc.streamerosai.com", path: "/emi-calculator/" });
  });

  it("drops messages from another origin, over-long bodies and junk, and never throws", async () => {
    const env = { DB: fakeD1() };
    await ingest(post(msg(), { origin: "https://evil.example.com" }), env);
    await ingest(post(null, { raw: "x".repeat(9000) }), env);
    await ingest(post(null, { raw: "not json" }), env);
    expect(rows(env.DB, "SELECT * FROM hits")).toHaveLength(0);
  });

  it("does not let a second site overwrite someone else's visit id", async () => {
    const env = { DB: fakeD1() };
    await ingest(post(msg({ hu: 1 })), env);
    await ingest(post(msg({ s: "tools.streamerosai.com", hu: 1, a: 999 }), { origin: "https://tools.streamerosai.com" }), env);
    expect(rows(env.DB, "SELECT site, active FROM hits")).toEqual([{ site: "calc.streamerosai.com", active: 0 }]);
  });

  it("records the network, never the address or the user agent", async () => {
    const env = { DB: fakeD1() };
    await ingest(post(msg()), env);
    const text = JSON.stringify(rows(env.DB, "SELECT * FROM hits"));
    expect(text).not.toMatch(/10\.0\.0\./);
    expect(text).not.toMatch(/Mozilla/);
  });
});

describe("reads", () => {
  async function seeded() {
    const env = { DB: fakeD1(), PULSE_KEY: "open-sesame" };
    await ingest(post(msg({ i: "real0000001", u: "sessreal001", hu: 1, a: 20, sc: 80, nc: 1, r: "https://www.google.com/", c: [{ n: 1, t: 3000, k: "link", l: "SIP", h: "/sip-calculator/", x: 30, y: 400, g: "nav", z: 0 }] })), env);
    await ingest(post(msg({ i: "unclear0001", u: "sessunclr01", hu: 0 })), env);
    await ingest(post(msg({ i: "bot00000001", u: "sessbot0001" }), { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" }), env);
    await ingest(post(msg({ i: "dc000000001", u: "sessdc00001" }), { cf: { country: "US", asOrganization: "Amazon.com, Inc.", asn: 16509 } }), env);
    await ingest(post(msg({ i: "wd000000001", u: "sesswd00001", wd: 1, hu: 0 })), env);
    return env;
  }
  const get = (env: object, path: string, key?: string) =>
    worker.fetch(new Request(`https://pulse.test${path}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} }), env);

  it("sorts visits into real, unclear and bot", async () => {
    const env = await seeded();
    const j = await (await get(env, "/v/summary?days=7&who=all")).json();
    const by = Object.fromEntries(j.status.map((s: { status: string; hits: number }) => [s.status, s.hits]));
    expect(by).toEqual({ real: 1, unclear: 1, bot: 3 });
  });

  it("lets a human action beat a robot-looking name or a hosting network, but not an automated browser", async () => {
    const env = { DB: fakeD1(), PULSE_KEY: "open-sesame" };
    await ingest(post(msg({ i: "uahuman0001", u: "sessuah0001", hu: 1, a: 12, nc: 2 }), { ua: CHROME + " SomeMonitorApp/2" }), env);
    await ingest(post(msg({ i: "dchuman0001", u: "sessdch0001", hu: 1, a: 9 }), { cf: { country: "US", asOrganization: "M247 Europe SRL", asn: 9009 } }), env);
    await ingest(post(msg({ i: "wdhuman0001", u: "sesswdh0001", hu: 1, wd: 1, a: 9 })), env);
    await ingest(post(msg({ i: "uaidle00001", u: "sessuai0001" }), { ua: CHROME + " SomeMonitorApp/2" }), env);
    await ingest(post(msg({ i: "dcidle00001", u: "sessdci0001" }), { cf: { country: "US", asOrganization: "M247 Europe SRL", asn: 9009 } }), env);
    await ingest(post(msg({ i: "idle0000001", u: "sessidle001" })), env);
    const feed = await (await get(env, "/v/feed", "open-sesame")).json();
    const by = Object.fromEntries(feed.map((r: { id: string; status: string; why: string }) => [r.id, `${r.status}/${r.why}`]));
    expect(by).toEqual({ uahuman0001: "real/acted", dchuman0001: "real/acted", wdhuman0001: "bot/auto", uaidle00001: "bot/ua", dcidle00001: "bot/host", idle0000001: "unclear/idle" });
    const people = await (await get(env, "/v/feed?who=people", "open-sesame")).json();
    expect(people.map((r: { id: string }) => r.id).sort()).toEqual(["dchuman0001", "idle0000001", "uahuman0001"]);
    const sum = await (await get(env, "/v/summary?days=7")).json();
    expect(sum.bots).toEqual(expect.arrayContaining([
      { org: "M247 Europe SRL", why: "host", n: 1, active: 0, clicks: 0 },
      { org: "Reliance Jio", why: "ua", n: 1, active: 0, clicks: 0 },
      { org: "Reliance Jio", why: "auto", n: 1, active: 9, clicks: 0 },
    ]));
  });

  it("lists referrers, pages and clicks for real visitors only by default", async () => {
    const env = await seeded();
    const j = await (await get(env, "/v/summary?days=7")).json();
    expect(j.who).toBe("real");
    expect(j.kinds).toEqual([{ ref_kind: "search", n: 1 }]);
    expect(j.pages).toHaveLength(1);
    expect(j.clicks[0]).toMatchObject({ label: "SIP", href: "/sip-calculator/", n: 1 });
  });

  it("shows who is on the sites right now, and not visits that went quiet", async () => {
    const env = await seeded();
    const j = await (await get(env, "/v/live")).json();
    expect(j.status.length).toBeGreaterThan(0);
    env.DB.db.exec("UPDATE hits SET last = last - 120000");
    const j2 = await (await get(env, "/v/live")).json();
    expect(j2.status).toEqual([]);
  });

  it("keeps one-by-one views behind the key", async () => {
    const env = await seeded();
    expect((await get({ DB: env.DB }, "/v/feed")).status).toBe(503);
    expect((await get(env, "/v/feed")).status).toBe(401);
    expect((await get(env, "/v/feed", "wrong-key-xx")).status).toBe(401);
    const ok = await get(env, "/v/feed?who=real", "open-sesame");
    expect(ok.status).toBe(200);
    const feed = await ok.json();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ status: "real", path: "/emi-calculator/", ref_kind: "search", country: "IN" });
    const jr = await (await get(env, "/v/journey?sid=sessreal001", "open-sesame")).json();
    expect(jr.hits).toHaveLength(1);
    expect(jr.clicks[0]).toMatchObject({ label: "SIP", kind: "link" });
    const cm = await (await get(env, "/v/clickmap?site=calc.streamerosai.com&path=/emi-calculator/", "open-sesame")).json();
    expect(cm.visits).toBe(1);
    expect(cm.clicks).toHaveLength(1);
  });

  it("answers the browser script and preflight requests", async () => {
    const env = await seeded();
    const js = await get(env, "/p.js");
    expect(js.headers.get("Content-Type")).toContain("javascript");
    const pre = await worker.fetch(new Request("https://pulse.test/v/feed", { method: "OPTIONS", headers: { Origin: "https://analytics.streamerosai.com" } }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("https://analytics.streamerosai.com");
    const other = await worker.fetch(new Request("https://pulse.test/v/feed", { method: "OPTIONS", headers: { Origin: "https://evil.example.com" } }), env);
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await worker.fetch(new Request("https://pulse.test/e", { method: "POST", body: "{}" }), env)).status).toBe(204);
  });
});

describe("the browser script", () => {
  it("is valid JavaScript and small", () => {
    expect(() => new Function(TRACKER)).not.toThrow();
    expect(TRACKER.length).toBeLessThan(10000);
  });

  it("holds the privacy rules in code: no cookies, no stored id, no typed text", () => {
    expect(TRACKER).not.toMatch(/document\.cookie|localStorage|\.value\b/);
    expect(TRACKER).toMatch(/globalPrivacyControl/);
    expect(TRACKER).toMatch(/doNotTrack/);
  });
});

describe("insights", () => {
  const qs = (o: Record<string, string> = {}) => new URLSearchParams({ days: "28", ...o });
  async function seed() {
    const env = { DB: fakeD1() };
    // a real visitor from search opens two pages and downloads a file; a second real visitor only reads; one bot
    await ingest(post(msg({ i: "hit0000001a", u: "sessaaaaaaa", p: "/", r: "https://www.google.com/", hu: 1, a: 20, sc: 80, lc: 1800, st: 200 })), env);
    await ingest(post(msg({ i: "hit0000001b", u: "sessaaaaaaa", p: "/emi-calculator/", r: "https://calc.streamerosai.com/", hu: 1, a: 30, sc: 60, c: [{ n: 1, t: 900, k: "dl", l: "Guide", h: "guide.pdf", x: 10, y: 10, g: "main", z: 0 }, { n: 2, t: 1200, k: "goal", l: "calc_done", h: "", x: 0, y: 0, g: "", z: 0 }] })), env);
    await ingest(post(msg({ i: "hit0000002a", u: "sessbbbbbbb", p: "/", r: "https://dev.to/x", hu: 1, a: 9, sc: 30, er: 2 })), env);
    await ingest(post(msg({ i: "hit0000003a", u: "sessccccccc", p: "/gone/", r: "https://www.bing.com/", hu: 1, a: 4, st: 404 })), env);
    await ingest(post(msg({ i: "hit0000004a", u: "sessddddddd", p: "/", hu: 0 }), { ua: "python-requests/2.31" }), env);
    return env;
  }

  it("counts people, wins, sources, entries and exits, and the second page people go to", async () => {
    const env = await seed();
    // visits are stamped with now(), so the two pages of one session would tie: space them like real life
    env.DB.db.exec("UPDATE hits SET ts = ts - 5000 WHERE id='hit0000001a'");
    const r = await insights(env, qs());
    expect(r.compare).toMatchObject({ real: 4, wins: 1, bots: 1 });
    expect(r.sources.find((x: { ref_kind: string }) => x.ref_kind === "search")).toMatchObject({ visits: 1, wins: 0 });
    const home = r.pages.find((x: { path: string }) => x.path === "/");
    expect(home).toMatchObject({ visits: 2, entries: 2, exits: 1 });
    expect(r.pages.find((x: { path: string }) => x.path === "/emi-calculator/")).toMatchObject({ visits: 1, wins: 1, exits: 1 });
    expect(r.flows[0]).toMatchObject({ from_path: "/", to_path: "/emi-calculator/", n: 1 });
    expect(r.funnel).toMatchObject({ sessions: 3 + 0, multi: 1, won: 1 });
    expect(r.actedDaily.reduce((a: number, d: { n: number }) => a + d.n, 0)).toBe(1);
  });

  it("lists broken pages, script errors and speed, and turns them into alerts", async () => {
    const env = await seed();
    const r = await insights(env, qs());
    expect(r.broken[0]).toMatchObject({ path: "/gone/", ref_host: "bing.com", n: 1 });
    expect(r.errors[0]).toMatchObject({ path: "/", errors: 2 });
    expect(r.speed[0]).toMatchObject({ path: "/", lcp: 1800 });
    const titles = r.alerts.map((a: { title: string }) => a.title).join(" | ");
    expect(titles).toMatch(/downloaded guide\.pdf/);
    expect(titles).toMatch(/Goal reached: calc_done/);
    expect(titles).toMatch(/broken page \(\/gone\/\)/);
  });

  it("filters by site and never throws on an empty database", async () => {
    const r = await insights({ DB: fakeD1() }, qs({ site: "calc.streamerosai.com" }));
    expect(r.compare).toMatchObject({ real: 0, wins: 0 });
    expect(r.alerts).toEqual([]);
  });
});
