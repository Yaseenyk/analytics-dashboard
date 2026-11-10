import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain JavaScript Worker, no type declarations
import worker from "../worker/src/index.js";

/* The Worker's index-health pipeline, run end to end against a fake Google, a fake GitHub and an in-memory KV. */

const ORIGIN = "https://analytics.streamerosai.com";
const HOSTS = ["yk", "campus", "", "fitrank", "spotai", "tools", "solar", "calc", "images", "math", "exams"].map((s) => (s ? `${s}.streamerosai.com` : "streamerosai.com"));

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

let env: { DATA: KV; GA_SERVICE_ACCOUNT_JSON: string; GITHUB_TOKEN?: string; OPTIMIZER_GITHUB_TOKEN?: string; MERGE_PASSPHRASE?: string };
let prState = "open";
let mergeCalls: string[] = [];
let calls: { url: string; method: string }[];
let ghRuns: unknown[];
let ghDispatchStatus: number;

async function serviceAccount() {
  const k = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", k.privateKey));
  const b64 = Buffer.from(der).toString("base64");
  return JSON.stringify({ client_email: "test@example.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` });
}

const reply = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = init?.method || "GET";
  calls.push({ url, method });
  if (url === "https://oauth2.googleapis.com/token") return Promise.resolve(reply({ access_token: "tok" }));
  const sm = url.match(/^https:\/\/([^/]+)\/sitemap\.xml$/);
  if (sm) return Promise.resolve(reply(`<urlset><url><loc>https://${sm[1]}/</loc></url><url><loc>https://${sm[1]}/ok</loc></url></urlset>`));
  if (url.includes("urlInspection/index:inspect")) {
    const u = JSON.parse(String(init?.body)).inspectionUrl as string;
    const pass = u.endsWith("/ok");
    return Promise.resolve(reply({ inspectionResult: { indexStatusResult: { coverageState: pass ? "Submitted and indexed" : "Discovered - currently not indexed", verdict: pass ? "PASS" : "NEUTRAL", lastCrawlTime: pass ? "2026-11-03T10:00:00Z" : undefined } } }));
  }
  if (url.startsWith("https://analytics.streamerosai.com/data/health.json")) return Promise.resolve(reply("nope", 404));
  if (url.includes("/actions/workflows/dashboard.yml/runs")) return Promise.resolve(reply({ workflow_runs: ghRuns }));
  if (/\/repos\/[^/]+\/[^/]+\/pulls\?state=open/.test(url)) {
    const repo = url.split("/repos/")[1].split("/pulls")[0];
    if (repo !== "Yaseenyk/portfolio") return Promise.resolve(reply([]));
    return Promise.resolve(reply([{ number: 7, title: "seo(optimizer): title for x", html_url: "https://github.com/x/7", body: "why", head: { ref: "optimizer/a", sha: "abc" }, created_at: "2026-11-05T00:00:00Z", state: prState }, { number: 8, title: "feat: unrelated", html_url: "u", body: "", head: { ref: "feature/z", sha: "def" }, created_at: "2026-11-05T00:00:00Z", state: "open" }]));
  }
  if (url.includes("/commits/abc/check-runs")) return Promise.resolve(reply({ check_runs: [{ status: "completed", conclusion: "success" }] }));
  if (/\/pulls\/7\/merge$/.test(url) && method === "PUT") { mergeCalls.push(url); return Promise.resolve(reply({ sha: "m1", merged: true })); }
  if (/\/pulls\/7$/.test(url) && method === "GET") return Promise.resolve(reply({ number: 7, title: "t", head: { ref: "optimizer/a", sha: "abc" }, state: prState }));
  if (/\/pulls\/8$/.test(url) && method === "GET") return Promise.resolve(reply({ number: 8, title: "t", head: { ref: "feature/z", sha: "def" }, state: "open" }));
  if (/\/pulls\/7$/.test(url) && method === "PATCH") { mergeCalls.push("close"); return Promise.resolve(reply({ state: "closed" })); }
  if (url.includes("/git/refs/heads/")) return Promise.resolve(new Response(null, { status: 204 }));
  if (url.includes("/actions/workflows/dashboard.yml/dispatches")) return Promise.resolve(new Response(null, { status: ghDispatchStatus }));
  return Promise.resolve(reply("unexpected " + url, 500));
}

const ctxOf = () => {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) }, settle: () => Promise.all(pending) };
};
const rerun = (name: string, origin: string | null = ORIGIN) => {
  const { ctx, settle } = ctxOf();
  const headers: Record<string, string> = origin ? { Origin: origin } : {};
  return worker.fetch(new Request(`https://analytics-api.test/rerun/${name}`, { method: "POST", headers }), env, ctx).then(async (r: Response) => {
    await settle();
    return r;
  });
};
async function tick(at = Date.UTC(2026, 10, 5, 5, 0)) {
  const { ctx, settle } = ctxOf();
  await worker.scheduled({ scheduledTime: at }, env, ctx);
  await settle();
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch);
  env = { DATA: new KV(), GA_SERVICE_ACCOUNT_JSON: await serviceAccount() };
});
beforeEach(() => {
  vi.stubGlobal("fetch", fakeFetch);
  env.DATA = new KV();
  env.GITHUB_TOKEN = undefined;
  env.OPTIMIZER_GITHUB_TOKEN = undefined;
  env.MERGE_PASSPHRASE = undefined;
  prState = "open";
  mergeCalls = [];
  calls = [];
  ghRuns = [];
  ghDispatchStatus = 204;
});
afterEach(() => vi.useRealTimers());

describe("re-run guards", () => {
  it("refuses a request that does not come from the dashboard", async () => {
    expect((await rerun("health", "https://evil.example")).status).toBe(403);
    expect((await rerun("health", null)).status).toBe(403);
  });
  it("answers 503 for the dashboard job when the token is missing, and 404 for an unknown job", async () => {
    expect((await rerun("dashboard")).status).toBe(503);
    env.GITHUB_TOKEN = "t";
    expect((await rerun("nothing")).status).toBe(404);
  });
  it("starts the dashboard workflow (202) and refuses while it is already running (409)", async () => {
    env.GITHUB_TOKEN = "t";
    const ok = await rerun("dashboard");
    expect(ok.status).toBe(202);
    expect(calls.some((c) => c.url.endsWith("/dispatches") && c.method === "POST")).toBe(true);
    // a second press inside 15 seconds is held back by the Worker itself
    expect((await rerun("dashboard")).status).toBe(429);
  });
  it("reports GitHub's refusal instead of pretending it worked", async () => {
    env.GITHUB_TOKEN = "t";
    vi.useFakeTimers({ now: Date.now() + 10 * 60_000, toFake: ["Date"] });
    ghDispatchStatus = 403;
    const r = await rerun("dashboard");
    expect(r.status).toBe(502);
  });
  it("enforces the 10-minute cooldown for the dashboard job", async () => {
    env.GITHUB_TOKEN = "t";
    vi.useFakeTimers({ now: Date.now() + 20 * 60_000, toFake: ["Date"] });
    ghRuns = [{ status: "completed", created_at: new Date(Date.now() - 3 * 60_000).toISOString() }];
    const r = await rerun("dashboard");
    expect(r.status).toBe(429);
    expect(calls.some((c) => c.url.endsWith("/dispatches"))).toBe(false);
  });
});

describe("index health pipeline", () => {
  it("plans from the sitemaps, inspects in batches, and publishes indexed and not-indexed lists", async () => {
    const start = await rerun("health");
    expect(start.status).toBe(202);
    // the first tick (run by the re-run itself) planned the queue
    const st = JSON.parse((await env.DATA.get("health:state"))!);
    expect(st.stage).toBe("inspect");
    expect(st.total).toBe(HOSTS.length * 2);

    for (let i = 0; i < 20 && (await env.DATA.get("health:state")); i++) await tick();
    expect(await env.DATA.get("health:state")).toBeNull();

    const res = await worker.fetch(new Request("https://analytics-api.test/data/health.json", { headers: { Origin: ORIGIN } }), env, ctxOf().ctx);
    expect(res.status).toBe(200);
    const file = await res.json();
    for (const h of HOSTS) {
      const s = file.index[h];
      expect(s.inspected).toBe(2);
      expect(s.indexed).toBe(1);
      expect(s.notIndexed).toBe(1);
      expect(s.urls).toEqual([[`https://${h}/`, "Discovered - currently not indexed", null]]);
      expect(s.indexedUrls).toEqual([`https://${h}/ok`]);
    }
    expect(file.indexAt).toBeTruthy();
  });

  it("refuses to start a second run while one is going, and shows its progress", async () => {
    await rerun("health");
    expect((await rerun("health")).status).toBe(409);
    const status = await (await worker.fetch(new Request("https://analytics-api.test/status/health"), env, ctxOf().ctx)).json();
    expect(status.running).toBe(true);
    expect(status.total).toBe(HOSTS.length * 2);
  });

  it("enforces the cooldown between runs", async () => {
    await rerun("health");
    for (let i = 0; i < 20 && (await env.DATA.get("health:state")); i++) await tick();
    const again = await rerun("health");
    expect(again.status).toBe(429);
  });

  it("starts by itself at 02:40 UTC and not at other minutes", async () => {
    await tick(Date.UTC(2026, 10, 5, 3, 0));
    expect(await env.DATA.get("health:state")).toBeNull();
    await tick(Date.UTC(2026, 10, 5, 2, 40));
    expect(await env.DATA.get("health:state")).not.toBeNull();
  });

  it("records a failed inspection as an error row instead of counting it as indexed", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes("index:inspect") ? Promise.resolve(reply({}, 403)) : fakeFetch(input, init)));
    await rerun("health");
    for (let i = 0; i < 20 && (await env.DATA.get("health:state")); i++) await tick();
    const file = JSON.parse((await env.DATA.get("health:file"))!);
    expect(file.index["solar.streamerosai.com"].indexed).toBe(0);
    expect(file.index["solar.streamerosai.com"].notIndexed).toBe(2);
    expect(Object.keys(file.index["solar.streamerosai.com"].byState)[0]).toMatch(/Could not inspect/);
  });
});

describe("routing", () => {
  it("answers CORS preflight only for allowed origins", async () => {
    const ok = await worker.fetch(new Request("https://analytics-api.test/rerun/health", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env, ctxOf().ctx);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const bad = await worker.fetch(new Request("https://analytics-api.test/rerun/health", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env, ctxOf().ctx);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("404s unknown paths and a health file that does not exist yet", async () => {
    expect((await worker.fetch(new Request("https://analytics-api.test/nope"), env, ctxOf().ctx)).status).toBe(404);
    expect((await worker.fetch(new Request("https://analytics-api.test/data/health.json"), env, ctxOf().ctx)).status).toBe(404);
  });
});

describe("optimizer pull requests", () => {
  const list = () => worker.fetch(new Request("https://analytics-api.test/optimizer/prs"), env, ctxOf().ctx).then((r: Response) => r.json());
  const act = (body: unknown, pass?: string, origin: string | null = ORIGIN) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (origin) headers.Origin = origin;
    if (pass !== undefined) headers["X-Passphrase"] = pass;
    return worker.fetch(new Request("https://analytics-api.test/optimizer/action", { method: "POST", headers, body: JSON.stringify(body) }), env, ctxOf().ctx);
  };
  it("lists only optimizer branches, with their check status", async () => {
    expect((await list()).error).toBe("no token");
    env.OPTIMIZER_GITHUB_TOKEN = "t";
    const j = await list();
    expect(j.prs).toHaveLength(1);
    expect(j.prs[0]).toMatchObject({ repo: "Yaseenyk/portfolio", number: 7, checks: "success", branch: "optimizer/a" });
  });
  it("refuses a merge without the right passphrase, the right origin, or on a non-optimizer branch", async () => {
    env.OPTIMIZER_GITHUB_TOKEN = "t";
    env.MERGE_PASSPHRASE = "open sesame";
    expect((await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" }, "open sesame", "https://evil.example")).status).toBe(403);
    expect((await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" }, "wrong")).status).toBe(401);
    expect((await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" })).status).toBe(401);
    expect((await act({ repo: "Yaseenyk/portfolio", number: 8, action: "merge" }, "open sesame")).status).toBe(403);
    expect((await act({ repo: "Yaseenyk/other", number: 7, action: "merge" }, "open sesame")).status).toBe(400);
    expect(mergeCalls).toEqual([]);
  });
  it("merges (squash) and declines with the passphrase, and says when the Worker is not set up", async () => {
    expect((await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" }, "x")).status).toBe(503);
    env.OPTIMIZER_GITHUB_TOKEN = "t";
    env.MERGE_PASSPHRASE = "open sesame";
    const m = await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" }, "open sesame");
    expect(m.status).toBe(200);
    expect(await m.json()).toMatchObject({ ok: true, merged: true });
    expect(mergeCalls.some((u) => u.endsWith("/pulls/7/merge"))).toBe(true);
    const c = await act({ repo: "Yaseenyk/portfolio", number: 7, action: "close" }, "open sesame");
    expect(c.status).toBe(200);
    expect(mergeCalls).toContain("close");
    prState = "closed";
    expect((await act({ repo: "Yaseenyk/portfolio", number: 7, action: "merge" }, "open sesame")).status).toBe(409);
  });
});
