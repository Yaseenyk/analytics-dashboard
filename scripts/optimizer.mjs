// Content optimizer: a measured loop, not a rewrite machine.
//   1. Read keywords.json: every query Google shows one of our pages for, with position and clicks (nightly, from Search Console).
//   2. Judge last month's changes: better, worse or no change, from the same numbers; a loser gets a revert pull request.
//   3. Propose: for a few pages just off page one, search the query, read what outranks us, and have GPT propose ONE change
//      (title, description, a missing section, an FAQ or an internal link) with the competitor pages as evidence.
//   4. Open the change as a pull request in that site's repo (never to main), record it as an experiment with its baseline.
//   5. Learn: every verdict is written to optimizer/learnings/<site>.json and fed back into the next proposal prompt.
// Guardrails: MAX_CHANGES per run, MAX_PER_SITE, one live experiment per page, frozen sites get reports only until
// FREEZE_UNTIL, no new facts or numbers (the prompt forbids them and a check rejects digits the page did not have),
// and without OPTIMIZER_GITHUB_TOKEN or with DRY_RUN=1 nothing but reports is written.
//
//   node scripts/optimizer.mjs             (in CI)        node scripts/optimizer.mjs --dry   (reports only)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const SITES = {
  "streamerosai.com": { repo: "Yaseenyk/streamer-os-website", indexed: true },
  "yk.streamerosai.com": { repo: "Yaseenyk/portfolio", indexed: true },
  "fitrank.streamerosai.com": { repo: "Yaseenyk/fitrank-website", indexed: true },
  "campus.streamerosai.com": { repo: "Yaseenyk/campus-site", indexed: true },
  "spotai.streamerosai.com": { repo: "Yaseenyk/spotai-website", indexed: true },
  "solar.streamerosai.com": { repo: "Yaseenyk/solar-site", indexed: true },
  // The tool sites belong to another working session: reports only, never pull requests.
  "tools.streamerosai.com": { repo: "Yaseenyk/sites-lab-yk", indexed: true, reportOnly: true },
  "calc.streamerosai.com": { repo: "Yaseenyk/sites-lab-yk", indexed: true, reportOnly: true },
  "images.streamerosai.com": { repo: "Yaseenyk/sites-lab-yk", indexed: true, reportOnly: true },
  "math.streamerosai.com": { repo: "Yaseenyk/sites-lab-yk", indexed: true, reportOnly: true },
};
const KEYWORDS_URL = "https://analytics.streamerosai.com/data/keywords.json";
const EXP_FILE = "optimizer/experiments.json";
const LEARN_DIR = "optimizer/learnings";
const REPORT_DIR = "optimizer/reports";
const DASH_FILE = "data/optimizer.json";
const JUDGE_AFTER_DAYS = 28;
const GIVE_UP_DAYS = 70;
const DAY = 864e5;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------- pure pieces (tested)
/** A keyword row's place: top (page one, top 3), near (just off the top, worth a change), far, or too few impressions to judge. */
export function classify(pos, impr) {
  if (impr < 10) return "low";
  if (pos <= 3) return "top";
  if (pos <= 20) return "near";
  return "far";
}
/** Candidate pages, best first: near rows with real impressions, one per page, none with an open experiment, capped per site and overall. */
export function pickCandidates(keywords, experiments, { maxChanges = 5, maxPerSite = 2, minImpr = 20 } = {}) {
  // open or measuring experiments block the page; a report-only proposal blocks it for two weeks so it is not paid for again
  const recent = Date.now() - 14 * DAY;
  const busy = new Set(experiments.filter((e) => e.status === "proposed" || e.status === "live" || (e.status === "report" && Date.parse(e.created) > recent)).map((e) => e.page));
  const perSite = {};
  const seen = new Set();
  const out = [];
  const rows = [];
  for (const [host, s] of Object.entries(keywords.sites || {})) for (const r of s.rows || []) rows.push({ host, ...r });
  rows
    .filter((r) => r.status === "near" && r.impr >= minImpr && !busy.has(r.page))
    .map((r) => ({ ...r, score: r.impr * (1 - Math.min(1, r.ctr / 10)) }))
    .sort((a, b) => b.score - a.score)
    .forEach((r) => {
      if (out.length >= maxChanges || seen.has(r.page) || (perSite[r.host] || 0) >= maxPerSite) return;
      seen.add(r.page);
      perSite[r.host] = (perSite[r.host] || 0) + 1;
      out.push(r);
    });
  return out;
}
/** Verdict for a live experiment from its baseline and the current row for the same page and query. */
export function judge(exp, row, onDate = today()) {
  if (!row) return Date.parse(onDate) - Date.parse(exp.liveSince || exp.created) > GIVE_UP_DAYS * DAY ? { verdict: "inconclusive", note: "Google stopped showing this page for the query." } : null;
  if (row.impr < 10) return null; // not enough data yet
  const dPos = exp.baseline.pos - row.pos; // positive = moved up
  const dCtr = exp.baseline.impr ? row.ctr - exp.baseline.ctr : 0;
  const delta = { pos: +dPos.toFixed(1), ctr: +dCtr.toFixed(2), clicks: row.clicks - exp.baseline.clicks };
  if (dPos >= 1 || (dCtr >= 1 && dPos > -1)) return { verdict: "better", delta };
  if (dPos <= -1.5 || (dCtr <= -1 && dPos < 1)) return { verdict: "worse", delta };
  return { verdict: "same", delta };
}
/** Replace `before` with `after` only when `before` occurs exactly once; anything else is refused rather than guessed. */
export function applyReplace(text, before, after) {
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) return { ok: false, text };
  return { ok: true, text: text.slice(0, first) + after + text.slice(first + before.length) };
}
/** Numbers in the proposal that are not on our page: the one kind of change a model must never make up. */
export function newNumbers(proposal, ourText) {
  const have = new Set((ourText.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, "")));
  return [...new Set((proposal.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, "")))].filter((n) => !have.has(n) && !/^(19|20)\d\d$/.test(n));
}
/** Visible text of an HTML page, trimmed for a prompt. */
export function extractText(html, max = 7000) {
  const t = html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(h[1-6])[^>]*>/gi, "\n## ")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  return t.length > max ? t.slice(0, max) + " …" : t;
}
export const pageTitle = (html) => ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || "").replace(/\s+/g, " ").trim();
export const pageDescription = (html) => ((/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) || [])[1] || "").trim();

// ---------------------------------------------------------------- OpenAI (Responses API, no SDK)
const PRICE = { "gpt-5-mini": [0.25, 2], "gpt-5": [1.25, 10], "gpt-5.5": [1.25, 10] }; // USD per million tokens, in/out: an estimate for the log only
const usage = { input: 0, output: 0, calls: 0 };
async function openai(body) {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = (process.env.OPENAI_MODEL || "gpt-5-mini").trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_output_tokens: 4000, ...body }), signal: AbortSignal.timeout(180000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 400 && body.tools && JSON.stringify(json).includes("web_search")) {
      // older accounts know the tool under its preview name
      body = { ...body, tools: body.tools.map((t) => (t.type === "web_search" ? { type: "web_search_preview" } : t)) };
      continue;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    usage.calls++;
    usage.input += json.usage?.input_tokens || 0;
    usage.output += json.usage?.output_tokens || 0;
    const text = (json.output || []).filter((o) => o.type === "message").flatMap((o) => o.content || []).map((c) => c.text || "").join("");
    const urls = (json.output || []).flatMap((o) => (o.content || []).flatMap((c) => (c.annotations || []).map((a) => a.url).filter(Boolean)));
    return { text, urls };
  }
  throw new Error("OpenAI: retries exhausted");
}
const schema = (name, properties, required = Object.keys(properties)) => ({ format: { type: "json_schema", name, strict: true, schema: { type: "object", properties, required, additionalProperties: false } } });

async function topResults(query, ourHost) {
  const { text, urls } = await openai({
    tools: [{ type: "web_search" }],
    input: `Search the web for the exact query "${query}" and list the top organic result URLs (not ads, not ${ourHost}). Return 5 URLs.`,
    text: schema("results", { urls: { type: "array", items: { type: "string" } } }),
  });
  let list = [];
  try { list = JSON.parse(text).urls || []; } catch { list = urls; }
  return [...new Set([...list, ...urls])].filter((u) => { try { return new URL(u).hostname !== ourHost && !new URL(u).hostname.endsWith("." + ourHost); } catch { return false; } }).slice(0, 5);
}
async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; streamerOS-optimizer; +https://analytics.streamerosai.com)" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") || "")) return null;
    return await res.text();
  } catch { return null; }
}
const CHANGE = schema("change", {
  gap_summary: { type: "string" },
  competitor_notes: { type: "array", items: { type: "object", properties: { url: { type: "string" }, does_better: { type: "string" } }, required: ["url", "does_better"], additionalProperties: false } },
  likely_authority_gap: { type: "boolean" },
  change_type: { type: "string", enum: ["title", "description", "section", "faq", "internal_link", "none"] },
  current_text: { type: "string" },
  new_text: { type: "string" },
  rationale: { type: "string" },
  evidence_urls: { type: "array", items: { type: "string" } },
});
async function propose(cand, ourHtml, competitors, learnings) {
  const ourText = extractText(ourHtml);
  const comp = competitors.map((c, i) => `COMPETITOR ${i + 1}: ${c.url}\nTITLE: ${pageTitle(c.html)}\n${extractText(c.html, 5000)}`).join("\n\n");
  const learned = learnings.length ? `What has worked on this site before (verdicts from Search Console):\n${learnings.slice(-12).map((l) => `- ${l.type}: ${l.verdict}${l.note ? ` (${l.note})` : ""}`).join("\n")}` : "No verdicts for this site yet.";
  const input = `You improve one web page so it ranks better for one Google query, with evidence, and you never invent facts.

QUERY: "${cand.q}"
OUR PAGE: ${cand.page}  (position ${cand.pos}, ${cand.impr} impressions, ${cand.clicks} clicks, CTR ${cand.ctr}% in the last 28 days)
OUR TITLE: ${pageTitle(ourHtml)}
OUR DESCRIPTION: ${pageDescription(ourHtml)}
OUR PAGE TEXT:
${ourText}

PAGES THAT OUTRANK US:
${comp || "(none could be read)"}

${learned}

Rules:
- Propose exactly ONE change, the one most likely to move this query: a better title (<= 60 characters), a description that answers the query (<= 155 characters), one missing section (Markdown, <= 180 words), one FAQ entry (question + answer, Markdown), or one internal link suggestion (say which existing page should link here and with what anchor). Use "none" if the page already covers what competitors do and the gap is probably authority (backlinks), and set likely_authority_gap.
- current_text must be copied EXACTLY from our page (the whole current title or description for those types; for section/faq/internal_link put the heading after which the new text should go, or "END").
- Never add a statistic, price, date, version number, name or claim that is not already on our page. If competitors win because of such a fact, say so in rationale as "needs a sourced figure" and propose a structural change instead.
- Keep the page's voice: plain words, short sentences, no hype, no exclamation marks, British or Indian English as the page uses.
- evidence_urls: the competitor URLs that justify the change.`;
  const { text } = await openai({ input, text: CHANGE });
  const p = JSON.parse(text);
  const nums = newNumbers(p.new_text || "", ourText + " " + pageTitle(ourHtml) + " " + pageDescription(ourHtml));
  if (nums.length) { p.change_type = "none"; p.rationale = `Rejected by the numbers check: the proposal introduced ${nums.join(", ")}, which the page does not have. ${p.rationale}`; }
  if (p.change_type === "title" && p.new_text.length > 70) p.new_text = p.new_text.slice(0, 70).trim();
  if (p.change_type === "description" && p.new_text.length > 170) p.new_text = p.new_text.slice(0, 170).trim();
  return p;
}

// ---------------------------------------------------------------- repo edits and pull requests
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const SKIP_DIRS = new Set(["node_modules", ".git", "out", "dist", ".next", "public", "build", "coverage"]);
const CONTENT_EXT = /\.(mdx?|tsx?|astro|json)$/i;
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CONTENT_EXT.test(name) && st.size < 600000) out.push(p);
  }
  return out;
}
/** The one file that holds `needle` exactly once; null when it is nowhere or in several places. */
export function locate(files, needle, read = (f) => fs.readFileSync(f, "utf8")) {
  const hits = [];
  for (const f of files) {
    const t = read(f);
    const i = t.indexOf(needle);
    if (i < 0) continue;
    hits.push({ file: f, unique: t.indexOf(needle, i + needle.length) < 0 });
    if (hits.length > 1) return null;
  }
  return hits.length === 1 && hits[0].unique ? hits[0].file : null;
}
async function gh(token, method, url, body) {
  const res = await fetch(`https://api.github.com${url}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "analytics-optimizer", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status} ${url}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
/** Clone the site, make the edit (or refuse when the text is not found exactly once), push a branch, open the pull request. */
async function openPr({ token, repo, id, title, body, edit }) {
  const dir = path.join("tmp-optimizer", id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync("tmp-optimizer", { recursive: true });
  execFileSync("git", ["clone", "--depth", "1", "--quiet", `https://x-access-token:${token}@github.com/${repo}.git`, dir], { stdio: "ignore" });
  const files = walk(dir);
  const result = edit(files);
  if (!result.ok) { fs.rmSync(dir, { recursive: true, force: true }); return { ok: false, reason: result.reason }; }
  const branch = `optimizer/${id}`;
  git(dir, "checkout", "-q", "-b", branch);
  git(dir, "-c", "user.name=analytics-bot", "-c", "user.email=actions@users.noreply.github.com", "commit", "-q", "-am", title);
  git(dir, "push", "-q", "-u", "origin", branch);
  const base = git(dir, "rev-parse", "--abbrev-ref", "origin/HEAD").replace(/^origin\//, "") || "main";
  const pr = await gh(token, "POST", `/repos/${repo}/pulls`, { title, head: branch, base, body });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, url: pr.html_url, number: pr.number, file: path.relative(dir, result.file) };
}
function editFor(p, ourHtml) {
  return (files) => {
    if (p.change_type === "title" || p.change_type === "description") {
      const f = locate(files, p.current_text);
      if (!f) return { ok: false, reason: `could not find the current ${p.change_type} exactly once in the repo` };
      const r = applyReplace(fs.readFileSync(f, "utf8"), p.current_text, p.new_text);
      fs.writeFileSync(f, r.text);
      return { ok: true, file: f };
    }
    // a new section or FAQ: find the page's Markdown file by its title, append at the end (or after the named heading)
    const t = pageTitle(ourHtml).replace(/\s*[|·–—-]\s*[^|·–—-]{2,40}$/, "");
    const f = locate(files.filter((x) => /\.mdx?$/i.test(x)), t);
    if (!f) return { ok: false, reason: "could not find the page's Markdown file by its title" };
    let text = fs.readFileSync(f, "utf8");
    const block = `\n\n${p.new_text.trim()}\n`;
    if (p.current_text && p.current_text !== "END") {
      const i = text.indexOf(p.current_text);
      if (i >= 0) { const next = text.indexOf("\n#", i + p.current_text.length); text = next >= 0 ? text.slice(0, next) + block + text.slice(next) : text + block; }
      else text += block;
    } else text += block;
    fs.writeFileSync(f, text);
    return { ok: true, file: f };
  };
}

// ---------------------------------------------------------------- files
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n"); };
const learningsOf = (host) => readJson(path.join(LEARN_DIR, `${host}.json`), { items: [] });

// ---------------------------------------------------------------- main
async function main() {
  const dry = !!process.env.DRY_RUN || process.argv.includes("--dry");
  const token = (process.env.OPTIMIZER_GITHUB_TOKEN || "").trim();
  const freezeUntil = process.env.FREEZE_UNTIL || "";
  const maxChanges = +(process.env.MAX_CHANGES || 5), maxPerSite = +(process.env.MAX_PER_SITE || 2);
  const date = today();
  const log = [];
  const say = (m) => { console.log(m); log.push(m); };
  say(`optimizer ${date}: ${dry ? "dry run" : token ? "pull requests on" : "no OPTIMIZER_GITHUB_TOKEN: reports only"}${freezeUntil && date < freezeUntil ? `, indexed sites frozen until ${freezeUntil}` : ""}`);

  const keywords = await fetch(KEYWORDS_URL).then((r) => r.ok ? r.json() : Promise.reject(new Error(`keywords.json ${r.status}`)));
  const state = readJson(EXP_FILE, { experiments: [] });
  const rowFor = (host, page, q) => (keywords.sites?.[host]?.rows || []).find((r) => r.page === page && r.q === q);

  // ---- 1. judge
  const judged = [];
  for (const e of state.experiments) {
    if (e.status === "proposed" && token && e.pr?.number) {
      const pr = await gh(token, "GET", `/repos/${e.repo}/pulls/${e.pr.number}`).catch(() => null);
      if (pr?.merged_at) { e.status = "live"; e.liveSince = pr.merged_at.slice(0, 10); e.judgeAfter = addDays(e.liveSince, JUDGE_AFTER_DAYS); say(`live: ${e.id} merged ${e.liveSince}`); }
      else if (pr && pr.state === "closed") { e.status = "declined"; say(`declined: ${e.id}`); }
    }
    if (e.status !== "live" || date < e.judgeAfter) continue;
    const v = judge(e, rowFor(e.host, e.page, e.q), date);
    if (!v) continue;
    e.status = "done"; e.verdict = v.verdict; e.delta = v.delta || null; e.judged = date;
    const L = learningsOf(e.host);
    L.items.push({ date, type: e.type, q: e.q, page: e.page, verdict: v.verdict, delta: v.delta || null, note: v.note || "" });
    writeJson(path.join(LEARN_DIR, `${e.host}.json`), L);
    judged.push(e);
    say(`judged ${e.id}: ${v.verdict} ${JSON.stringify(v.delta || {})}`);
    if (v.verdict === "worse" && token && !dry && e.before && e.after && (e.type === "title" || e.type === "description")) {
      const r = await openPr({ token, repo: e.repo, id: `${e.id}-revert`, title: `revert(optimizer): ${e.type} change for "${e.q}" made it worse`, body: `Experiment ${e.id}: position ${e.baseline.pos} -> ${(e.baseline.pos - v.delta.pos).toFixed(1)}, CTR ${e.baseline.ctr}% -> ${(e.baseline.ctr + v.delta.ctr).toFixed(2)}% after ${JUDGE_AFTER_DAYS} days. This puts the previous ${e.type} back.`, edit: (files) => { const f = locate(files, e.after); if (!f) return { ok: false, reason: "changed text not found" }; fs.writeFileSync(f, applyReplace(fs.readFileSync(f, "utf8"), e.after, e.before).text); return { ok: true, file: f }; } }).catch((x) => ({ ok: false, reason: x.message }));
      e.revertPr = r.ok ? r.url : `not opened: ${r.reason}`;
    }
  }

  // ---- 2. propose
  const cands = pickCandidates(keywords, state.experiments, { maxChanges, maxPerSite });
  say(`${cands.length} candidate page(s)`);
  const proposals = [];
  for (const c of cands) {
    const site = SITES[c.host];
    const frozen = site?.indexed && freezeUntil && date < freezeUntil;
    const canPr = !!token && !dry && site && !site.reportOnly && !frozen;
    try {
      const ourHtml = await fetchPage(c.page);
      if (!ourHtml) { say(`skip ${c.page}: could not fetch`); continue; }
      const urls = await topResults(c.q, c.host);
      const competitors = [];
      for (const u of urls) { if (competitors.length >= 3) break; const html = await fetchPage(u); if (html) competitors.push({ url: u, html }); }
      const p = await propose(c, ourHtml, competitors, learningsOf(c.host).items);
      const id = `${date}-${c.host.split(".")[0]}-${(new URL(c.page).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home").slice(0, 40)}`;
      const rec = { id, host: c.host, repo: site?.repo || "", page: c.page, q: c.q, type: p.change_type, created: date, status: "report", baseline: { pos: c.pos, ctr: c.ctr, impr: c.impr, clicks: c.clicks }, before: p.current_text, after: p.new_text, rationale: p.rationale, evidence: p.evidence_urls, competitors: p.competitor_notes, authorityGap: p.likely_authority_gap, gap: p.gap_summary };
      if (p.change_type !== "none" && canPr) {
        const body = `**Query:** "${c.q}" · position ${c.pos}, ${c.impr} impressions, ${c.clicks} clicks, CTR ${c.ctr}% (28 days)\n\n**What outranks us:**\n${(p.competitor_notes || []).map((n) => `- ${n.url}: ${n.does_better}`).join("\n")}\n\n**Change (${p.change_type}):** ${p.rationale}\n\n**Before:**\n\n${p.current_text}\n\n**After:**\n\n${p.new_text}\n\nOne change only, so the effect can be measured. The optimizer judges it against Search Console after ${JUDGE_AFTER_DAYS} days and opens a revert if it made things worse. Experiment \`${id}\`.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
        const r = await openPr({ token, repo: site.repo, id, title: `seo(optimizer): ${p.change_type} for "${c.q}"`, body, edit: editFor(p, ourHtml) }).catch((x) => ({ ok: false, reason: x.message }));
        if (r.ok) { rec.status = "proposed"; rec.pr = { url: r.url, number: r.number, file: r.file }; say(`PR: ${r.url}`); }
        else { rec.note = `no pull request: ${r.reason}`; say(`report only for ${c.page}: ${r.reason}`); }
      } else if (p.change_type === "none") say(`no change for ${c.page}: ${p.rationale.slice(0, 120)}`);
      else say(`report only for ${c.page} (${frozen ? "frozen" : site?.reportOnly ? "other session's repo" : "no token or dry run"})`);
      proposals.push(rec);
      state.experiments.push(rec);
    } catch (e) {
      say(`failed ${c.page}: ${e.message}`);
    }
  }

  // ---- 3. write everything
  writeJson(EXP_FILE, state);
  const [pin, pout] = PRICE[(process.env.OPENAI_MODEL || "gpt-5-mini").trim()] || [1, 5];
  const cost = (usage.input * pin + usage.output * pout) / 1e6;
  say(`OpenAI: ${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens, about $${cost.toFixed(3)}`);
  const md = [`# Optimizer run ${date}`, "", ...log.map((l) => `- ${l}`), "", "## Proposals", "", ...proposals.map((p) => `### ${p.host} · "${p.q}"\n\n${p.page}\n\nPosition ${p.baseline.pos}, ${p.baseline.impr} impressions, CTR ${p.baseline.ctr}%. ${p.gap}\n\n${(p.competitors || []).map((c) => `- ${c.url}: ${c.does_better}`).join("\n")}\n\n**${p.type}** — ${p.rationale}\n\nBefore: ${p.before}\n\nAfter: ${p.after}\n\n${p.pr ? `Pull request: ${p.pr.url}` : p.note || "Report only."}\n`), "", "## Judged", "", ...judged.map((e) => `- ${e.id}: ${e.verdict} ${JSON.stringify(e.delta || {})}${e.revertPr ? ` · revert: ${e.revertPr}` : ""}`)].join("\n");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, `${date}.md`), md + "\n");
  const learn = {};
  for (const host of Object.keys(SITES)) { const L = learningsOf(host).items; if (L.length) learn[host] = L; }
  writeJson(DASH_FILE, { generatedAt: new Date().toISOString(), lastRun: { date, proposed: proposals.length, judged: judged.length, mode: dry ? "dry" : token ? "pr" : "report", costUsd: +cost.toFixed(3), log }, experiments: state.experiments.slice(-200), learnings: learn });
  fs.rmSync("tmp-optimizer", { recursive: true, force: true });
}

// Run only when invoked directly (vitest imports this file for its pure functions).
if (process.argv[1] && /optimizer\.mjs$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
