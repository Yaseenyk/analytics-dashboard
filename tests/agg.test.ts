import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { goals as goalsSql, insights as insightsSql, summary as summarySql } from "../pulse/src/lib.js";
// @ts-expect-error plain JavaScript, no type declarations
import { goalsFast, insightsFast, summaryFast } from "../pulse/src/reads.js";

/**
 * The dashboard's numbers used to come from about 55 SQL questions (lib.js); they now come from one read worked out in memory (agg.js).
 * This builds a few hundred varied visits, clicks and errors and checks the two give the same answers, so the fast code can never
 * quietly drift from the rules. Lists cut at a top-N may choose different items among those tied at the cut-off; that is not a difference.
 */

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
        async run() { const r = db.prepare(sql).run(...(args as never[])); return { meta: { changes: Number(r.changes) } }; },
      };
      return st;
    },
  };
}

/** A small deterministic random generator, so a failure can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const SITES = ["calc.streamerosai.com", "esports.streamerosai.com", "yk.streamerosai.com", "streamerosai.com"];
const PATHS = ["/", "/about/", "/tools/", "/guides/a/", "/guides/b/", "/pricing", "/blog/x"];
const REFS: [string, string][] = [["direct", ""], ["search", "www.google.com"], ["search", "bing.com"], ["social", "linkedin.com"], ["internal", "x.com"], ["other", "news.example"], ["own", "streamerosai.com"], ["ai", "chatgpt.com"]];
const KINDS = ["link", "out", "btn", "dl", "mail", "tel", "goal", "other", "fab", "input", "tab"];
const HREFS = ["", "wa.me/91", "github.com/x", "play.google.com/store", "solar.streamerosai.com/", "example.org/p", "whatsapp.com/x", "apps.apple.com/a"];
const LABELS = ["SIP", "Download", "form:contact", "form:signup", "Buy", "span", "Close"];
const MSGS = ["TypeError: x is not a function", "React error #418", "Hydration failed because", "ResizeObserver loop"];

function seed(env: { DB: ReturnType<typeof fakeD1> }, n: number, seedNo: number) {
  const r = rng(seedNo);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const now = Date.now();
  const insH = env.DB.db.prepare(`INSERT INTO hits (id,sid,site,path,ts,last,ref_host,ref_kind,country,device,browser,os,org,human,bot,dc,wd,scroll,active,clicks,st,lcp,err,vid,me,seen,tr,tl,net,inp,cls) VALUES (${Array(31).fill("?").join(",")})`);
  const insC = env.DB.db.prepare("INSERT INTO clicks (hid,n,ts,site,path,kind,label,href,x,y,sec,z) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  const insE = env.DB.db.prepare("INSERT INTO errs (hid,ts,site,path,msg,tr) VALUES (?,?,?,?,?,?)");
  // a visit is one tab: its page views are within a few hours of each other, and the visitor code is for one person on one day
  const visits = Math.floor(n * 0.6);
  const base = Array.from({ length: visits }, () => now - Math.floor(r() * 45 * 864e5));
  let sidN = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * visits);
    const sid = `s${v}`;
    const site = SITES[v % SITES.length]!;
    const ts = base[v]! + Math.floor(r() * 3 * 36e5);
    const [rk, rh] = pick(REFS);
    const human = r() < 0.35 ? 1 : 0, bot = r() < 0.12 ? 1 : 0, dc = r() < 0.1 ? 1 : 0, wd = r() < 0.05 ? 1 : 0;
    const id = `h${i}`;
    const vid = r() < 0.7 ? `v${new Date(base[v]!).toISOString().slice(0, 10)}_${v % 9}` : "";
    insH.run(id, sid, site, pick(PATHS), ts, ts + Math.floor(r() * 90000), rh, rk, pick(["IN", "US", "DE", "BR", "", "GB"]), pick(["mobile", "desktop"]), pick(["Chrome", "Safari", "Edge"]), pick(["Android", "Windows", "iOS"]), pick(["Jio", "Airtel", "Microsoft Corporation", ""]),
      human, bot, dc, wd, Math.floor(r() * 100), Math.floor(r() * 120), 0, r() < 0.06 ? 404 : 200, r() < 0.7 ? Math.floor(r() * 6000) : 0, r() < 0.1 ? Math.floor(r() * 3) : 0, vid, r() < 0.08 ? 1 : 0, r() < 0.8 ? Math.floor(r() * 60) : 0, r() < 0.1 ? 1 : 0, pick(["", "hi", "pt"]), pick(["", "4g", "3g"]), r() < 0.15 ? 200 + Math.floor(r() * 400) : 0, r() < 0.1 ? Math.floor(r() * 300) : 0);
    const nc = Math.floor(r() * 4);
    for (let c = 0; c < nc; c++) insC.run(id, c + 1, ts + Math.floor(r() * 3e6) + (r() < 0.02 ? 80000000 : 0), site, "/", pick(KINDS), pick(LABELS), pick(HREFS), Math.floor(r() * 100), Math.floor(r() * 3000), pick(["nav", "main", ""]), r() < 0.1 ? 1 : 0);
    if (r() < 0.08) insE.run(id, ts + 1000, site, pick(PATHS), pick(MSGS), r() < 0.5 ? 1 : 0);
    sidN++;
  }
  return sidN;
}

const canon = (x: unknown) => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as object).sort(([p], [q]) => (p < q ? -1 : 1))) : v));
const METRICS = ["n", "visits", "errors", "lcp", "worst", "cls", "left_unsent", "people", "last", "avg"];

/** Every difference between two answers, ignoring the order of tied items and which tied items a top-N list happens to cut at. */
function differences(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const ca = a.map(canon), cb = b.map(canon);
    if (ca.length === cb.length && [...ca].sort().every((x, i) => x === [...cb].sort()[i])) return [];
    const onlyA = ca.filter((x) => !cb.includes(x)), onlyB = cb.filter((x) => !ca.includes(x));
    // items tied at the cut-off may be chosen differently: fine when every differing item has the lowest value of the list's sort column
    if (a.length === b.length) {
      const ok = METRICS.some((m) => a.every((x) => x && typeof x === "object" && m in (x as object)) && (() => {
        const lowest = Math.min(...a.map((x) => (x as Record<string, number>)[m]!));
        const lowestB = Math.min(...b.map((x) => (x as Record<string, number>)[m]!));
        return lowest === lowestB && [...onlyA, ...onlyB].every((x) => (JSON.parse(x) as Record<string, number>)[m] === lowest);
      })());
      if (ok) return [];
    }
    return [`${path}: lists differ (${a.length} vs ${b.length}); only in SQL ${onlyA.slice(0, 2).join(" ").slice(0, 200)} | only in fast ${onlyB.slice(0, 2).join(" ").slice(0, 200)}`];
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`));
  }
  return [`${path}: sql=${JSON.stringify(a)} fast=${JSON.stringify(b)}`];
}

const clean = (j: unknown) => {
  const o = JSON.parse(JSON.stringify(j, (k, v) => (k === "generatedAt" ? undefined : v)));
  if (Array.isArray(o?.alerts)) o.alerts.forEach((a: { id: string; ts?: number }) => { if (String(a.id).startsWith("bots-")) delete a.ts; }); // "now" when it was worked out
  return o;
};

describe("the in-memory numbers match the SQL numbers", () => {
  for (const seedNo of [1, 2, 3]) {
    it(`on a random set of visits (seed ${seedNo})`, async () => {
      const env = { DB: fakeD1() };
      seed(env, 260, seedNo);
      const combos: { days: number; site: string; who?: string }[] = [];
      for (const days of [1, 7, 28, 90]) for (const site of ["", ...SITES.slice(0, 3)]) combos.push({ days, site, who: seedNo === 2 ? "all" : undefined });
      for (const c of combos) {
        const q = new URLSearchParams({ days: String(c.days), ...(c.site ? { site: c.site } : {}), ...(c.who ? { who: c.who } : {}) });
        for (const [name, sql, fast] of [["summary", summarySql, summaryFast], ["insights", insightsSql, insightsFast], ["goals", goalsSql, goalsFast]] as const) {
          const d = differences(clean(await sql(env, q)), clean(await fast(env, q)));
          expect(d, `${name} ${q.toString()}`).toEqual([]);
        }
      }
    });
  }

  it("reads each row once, not once per question", async () => {
    const env = { DB: fakeD1() };
    seed(env, 260, 7);
    let reads = 0;
    const real = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => { reads++; return real(sql); };
    await summaryFast(env, new URLSearchParams({ days: "28" }));
    expect(reads).toBe(2); // one question for the page views, one for the clicks
    reads = 0;
    await summarySql(env, new URLSearchParams({ days: "28" }));
    expect(reads).toBeGreaterThan(10);
  });
});
