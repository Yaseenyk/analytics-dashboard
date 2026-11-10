// Daily pull from the Microsoft Clarity Data Export API, one project per site. Free, but the API allows only 10 requests per
// project per day and only the last 1 to 3 days, so this runs once a day (clarity.yml), asks for 3 days, and keeps its own history.
//   Tokens: the CLARITY_TOKENS secret, a JSON object { "<host>": "<token>" }. A token is made in that Clarity project:
//   Settings -> Data Export -> Generate new API token (project admin only). Sites without a token are skipped.
//   node scripts/clarity.mjs        writes data/clarity.json (newest run last, 60 kept); scripts/build.mjs publishes it.
import fs from "node:fs";

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const FILE = "data/clarity.json";

const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const first = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Turn one Clarity response (an array of { metricName, information: [...] }) into the few numbers the dashboard shows. */
export function summarize(resp) {
  const by = {};
  for (const m of Array.isArray(resp) ? resp : []) by[String(m.metricName || "").toLowerCase()] = m.information || [];
  const row = (name) => (by[name.toLowerCase()] || [])[0] || null;
  const traffic = row("Traffic");
  const sessions = num(first(traffic, ["totalSessionCount"]));
  const bots = num(first(traffic, ["totalBotSessionCount"]));
  const engagement = row("EngagementTime");
  const scroll = row("ScrollDepth");
  // A frustration signal: the share of sessions that had it, and how many.
  const signal = (name) => {
    const r = row(name);
    if (!r) return null;
    return { pct: num(first(r, ["sessionsWithMetricPercentage"])), sessions: num(first(r, ["sessionsCount"])) };
  };
  const pages = (by["popularpages"] || [])
    .map((r) => ({ url: String(first(r, ["url", "Url", "URL"]) || ""), visits: num(first(r, ["visitsCount", "totalSessionCount", "sessionsCount"])) }))
    .filter((p) => p.url)
    .sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0))
    .slice(0, 8);
  return {
    sessions,
    botSessions: bots,
    humanSessions: sessions !== null && bots !== null ? Math.max(0, sessions - bots) : null,
    users: num(first(traffic, ["distantUserCount"])),
    pagesPerSession: num(first(traffic, ["PagesPerSessionPercentage", "pagesPerSession"])),
    scrollDepth: num(first(scroll, ["averageScrollDepth", "scrollDepth"])),
    activeSeconds: num(first(engagement, ["activeTime"])),
    totalSeconds: num(first(engagement, ["totalTime"])),
    rageClicks: signal("RageClickCount"),
    deadClicks: signal("DeadClickCount"),
    excessiveScroll: signal("ExcessiveScroll"),
    quickBacks: signal("QuickbackClick"),
    scriptErrors: signal("ScriptErrorCount"),
    errorClicks: signal("ErrorClickCount"),
    topPages: pages,
  };
}

async function fetchOne(host, token) {
  const url = `${ENDPOINT}?numOfDays=3`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${host}: Clarity answered ${res.status}`);
  return summarize(await res.json());
}

async function main() {
  let tokens = {};
  try { tokens = JSON.parse(process.env.CLARITY_TOKENS || "{}"); } catch { console.error("CLARITY_TOKENS is not valid JSON"); process.exit(1); }
  const hosts = Object.keys(tokens);
  if (!hosts.length) { console.log("clarity: no tokens set, nothing to do"); return; }
  const sites = {};
  const errors = [];
  for (const h of hosts) {
    try { sites[h] = await fetchOne(h, tokens[h]); console.log(`clarity: ${h} ok (${sites[h].sessions} sessions)`); }
    catch (e) { errors.push(String(e.message || e)); console.warn(`clarity: ${e.message || e}`); }
  }
  if (!Object.keys(sites).length) { console.error("clarity: every project failed, keeping the old file"); process.exit(1); }
  let file = { generatedAt: "", runs: [] };
  try { file = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* first run */ }
  const at = new Date().toISOString();
  file = { generatedAt: at, runs: [...file.runs, { at, window: "last 3 days", sites, errors }].slice(-60) };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(file));
}

if (process.argv[1] && /clarity\.mjs$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
