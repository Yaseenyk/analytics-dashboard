// Extra jobs for the dashboard, all free: they run inside the Worker (cron + KV) or call free public APIs.
//   history:index   one row per day of "pages in Google" per site, so the Health tab can draw a trend
//   alerts          things that need a look (pages dropped out of Google, new broken pages, traffic drop, failed workflows)
//   ranks:file      Google position per tracked phrase, per day (from Search Console)
//   crawl:file      a daily check of every sitemap URL: broken, redirecting, noindex, no title, linked but not in the sitemap
// The Worker's own helpers (Google calls, KV reader) are handed in, so this file has no import cycle with index.js.

const DAY = 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
const kvJson = async (env, key) => { const v = await env.DATA.get(key); return v ? JSON.parse(v) : null; };

/** Phrases whose Google position is tracked every day. A query counts when it contains the phrase. Edit this list to track others. */
export const TRACKED_KEYWORDS = [
  'streamlabs vs obs', 'obs encoding overloaded', 'nvenc vs x264', 'obs settings', 'obs low cpu',
  'pm surya ghar', 'solar subsidy', 'final year project', 'viva questions', 'fitrank',
  // added 14 Nov 2026 (SEO gap study, docs/seo-gap-2026-11-14.md in the portfolio repo)
  'mca final year project', 'mca project', 'mca project report', 'mca synopsis', 'bca final year project', 'mern stack project',
  'crawled currently not indexed', 'discovered currently not indexed', 'currently not indexed next', 'blank page google not indexed',
  'free fire tournament', 'bgmi tournament', 'tournament bracket', 'esports tournament',
];
export const RANK_PROPERTY = 'sc-domain:streamerosai.com';

/** GitHub repositories whose latest run of every workflow is checked for failures. */
export const WATCH_REPOS = [
  'Yaseenyk/portfolio', 'Yaseenyk/streamer-os-website', 'Yaseenyk/fitrank-website', 'Yaseenyk/campus-site', 'Yaseenyk/spotai-website',
  'Yaseenyk/solar-site', 'Yaseenyk/exams', 'Yaseenyk/analytics-dashboard', 'Yaseenyk/linkedin-bot', 'Yaseenyk/sites-lab-yk',
];

// ---- alerts ----------------------------------------------------------------------------------------
async function telegram(env, list) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  for (const a of list.slice(0, 5)) {
    const text = `${a.level === 'bad' ? '🔴' : a.level === 'good' ? '🟢' : '🟡'} ${a.title}${a.detail ? `\n${a.detail}` : ''}\nhttps://analytics.streamerosai.com/health/`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    }).catch(() => {});
  }
}
/** Save alerts (newest first, 60 kept). The same id is never saved twice, so a daily check cannot repeat itself. Optional Telegram push. */
export async function addAlerts(env, list) {
  if (!list.length) return [];
  const cur = (await kvJson(env, 'alerts')) || [];
  const have = new Set(cur.map((a) => a.id));
  const at = new Date().toISOString();
  const fresh = list.map((a) => ({ ...a, at, id: a.id || `${a.kind}:${a.title}:${at.slice(0, 10)}` })).filter((a) => !have.has(a.id));
  if (!fresh.length) return [];
  await env.DATA.put('alerts', JSON.stringify([...fresh, ...cur].slice(0, 60)));
  await telegram(env, fresh);
  return fresh;
}

// ---- index history + dropped pages ------------------------------------------------------------------
/** Called when an index check finishes: append today's counts and flag pages that left Google (or got in). */
export async function recordHealth(env, prior, index, nowIso) {
  const d = nowIso.slice(0, 10);
  const hist = (await kvJson(env, 'history:index')) || [];
  const row = { d, sites: Object.fromEntries(Object.entries(index).map(([h, s]) => [h, [s.indexed, s.inspected]])) };
  await env.DATA.put('history:index', JSON.stringify(hist.filter((x) => x.d !== d).concat(row).slice(-400)));
  const alerts = [];
  for (const [h, s] of Object.entries(index)) {
    if (!s.inspected) { alerts.push({ kind: 'health', level: 'warn', title: `The index check found no pages for ${h}`, detail: 'Its sitemap may be down or empty.', id: `health-empty:${h}:${d}` }); continue; }
    const before = new Set(prior?.index?.[h]?.indexedUrls ?? []);
    if (!before.size) continue;
    const errored = new Set((s.urls || []).filter((u) => String(u[1]).startsWith('Could not inspect')).map((u) => u[0]));
    const nowSet = new Set(s.indexedUrls ?? []);
    const lost = [...before].filter((u) => !nowSet.has(u) && !errored.has(u));
    // A page whose check failed last time is not in `before` even if it was already indexed; do not call it new.
    const failedBefore = new Set((prior?.index?.[h]?.urls ?? []).filter((u) => String(u[1]).startsWith('Could not inspect')).map((u) => u[0]));
    const gained = [...nowSet].filter((u) => !before.has(u) && !failedBefore.has(u));
    if (lost.length) alerts.push({ kind: 'dropped', level: 'bad', title: `${lost.length} page${lost.length > 1 ? 's' : ''} dropped out of Google on ${h}`, detail: lost.slice(0, 3).map((u) => u.replace(/^https?:\/\/[^/]+/, '') || '/').join(', '), id: `dropped:${h}:${d}` });
    if (gained.length) alerts.push({ kind: 'indexed', level: 'good', title: `${gained.length} new page${gained.length > 1 ? 's' : ''} in Google on ${h}`, detail: gained.slice(0, 3).map((u) => u.replace(/^https?:\/\/[^/]+/, '') || '/').join(', '), id: `indexed:${h}:${d}` });
  }
  await addAlerts(env, alerts);
}

// ---- site crawl: broken links, redirects, noindex, titles --------------------------------------------
const CRAWL_BATCH = 40;
const ASSET = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|mp4|woff2?)$/i;

async function readHead(res, max = 12000) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  while (out.length < max) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return out;
}
function internalLinks(html, host) {
  const out = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#?]+)/gi)) {
    let u;
    try { u = new URL(m[1], `https://${host}/`); } catch { continue; }
    if (u.hostname !== host || ASSET.test(u.pathname)) continue;
    out.add(`https://${host}${u.pathname}`);
  }
  return [...out];
}
export async function crawlStart(env, trigger) {
  await env.DATA.put('crawl:state', JSON.stringify({ stage: 'plan', startedAt: Date.now(), trigger, queue: [], issues: {}, checked: {}, total: 0 }));
  await env.DATA.put('crawl:lastStart', String(Date.now()));
}
export async function crawlStatus(env) {
  const st = await kvJson(env, 'crawl:state');
  const file = await kvJson(env, 'crawl:file');
  return { running: !!st, stage: st?.stage ?? null, done: st ? st.total - st.queue.length : 0, total: st?.total ?? 0, lastFinished: file?.generatedAt ?? null, lastStart: Number(await env.DATA.get('crawl:lastStart')) || null };
}
async function checkUrl(url, fromSitemap, metas) {
  const issue = (kind, detail) => ({ url, kind, detail });
  let res;
  try { res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'streamerOS-site-check' }, signal: AbortSignal.timeout(10000) }); } catch { return issue('broken', 'no answer'); }
  const st = res.status;
  if (st >= 300 && st < 400) return fromSitemap ? issue('redirect', `${st} to ${res.headers.get('location') || '?'}`) : null;
  if (st >= 400) return issue('broken', `HTTP ${st}`);
  const html = /text\/html/i.test(res.headers.get('content-type') || '') ? await readHead(res) : '';
  if (!html) return fromSitemap ? null : issue('not-in-sitemap', 'linked from the home page, not in the sitemap');
  if (fromSitemap && metas) metas.push([url, ...pageMeta(html)]);
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  if (fromSitemap && noindex) return issue('noindex', 'in the sitemap but marked noindex');
  if (!fromSitemap) return noindex ? null : issue('not-in-sitemap', 'linked from the home page, not in the sitemap');
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!t || !t[1].trim()) return issue('no-title', 'the page has no title');
  return null;
}
const unesc = (x) => String(x || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** [title, description] from a page's head, so the share kit can describe the page in its own words. */
function pageMeta(html) {
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const d = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) || /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html);
  return [unesc(t && t[1]).slice(0, 160), unesc(d && d[1]).slice(0, 300)];
}
export async function crawlTick(env, h) {
  const st = await kvJson(env, 'crawl:state');
  if (!st) return;
  if (st.stage === 'plan') {
    const lists = await Promise.all(h.hosts.map((x) => h.sitemapUrlsFor(x)));
    const homes = await Promise.all(h.hosts.map((x) => fetch(`https://${x}/`, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? readHead(r, 60000) : '')).catch(() => '')));
    st.queue = [];
    h.hosts.forEach((host, i) => {
      const inMap = new Set(lists[i]);
      lists[i].forEach((u) => st.queue.push([host, u, 1]));
      internalLinks(homes[i], host).filter((u) => !inMap.has(u) && !inMap.has(u + '/') && !inMap.has(u.replace(/\/$/, ''))).slice(0, 15).forEach((u) => st.queue.push([host, u, 0]));
    });
    st.total = st.queue.length;
    st.stage = 'check';
    await env.DATA.put('crawl:state', JSON.stringify(st));
    return;
  }
  const batch = st.queue.splice(0, CRAWL_BATCH);
  const metas = [];
  const rows = await h.pool(batch.map(([, u, m]) => () => checkUrl(u, !!m, metas)), 6);
  st.pages = st.pages || {};
  for (const [u, t, d] of metas) { try { const host = new URL(u).hostname; (st.pages[host] = st.pages[host] || []).push([u, t, d]); } catch { /* skip */ } }
  batch.forEach(([host], i) => {
    st.checked[host] = (st.checked[host] || 0) + 1;
    if (rows[i]) (st.issues[host] = st.issues[host] || []).push(rows[i]);
  });
  if (st.queue.length) { await env.DATA.put('crawl:state', JSON.stringify(st)); return; }
  const sites = {};
  for (const host of h.hosts) {
    const issues = st.issues[host] || [];
    const counts = {};
    issues.forEach((x) => (counts[x.kind] = (counts[x.kind] || 0) + 1));
    sites[host] = { checked: st.checked[host] || 0, counts, issues: issues.slice(0, 200), pages: (st.pages && st.pages[host]) || [] };
  }
  const prior = await kvJson(env, 'crawl:file');
  const now = new Date().toISOString();
  await env.DATA.put('crawl:file', JSON.stringify({ generatedAt: now, sites }));
  await env.DATA.delete('crawl:state');
  const alerts = [];
  for (const host of h.hosts) {
    const nb = sites[host].counts.broken || 0;
    const pb = prior?.sites?.[host]?.counts?.broken || 0;
    if (nb > pb) alerts.push({ kind: 'broken', level: 'bad', title: `${nb - pb} new broken page${nb - pb > 1 ? 's' : ''} on ${host}`, detail: sites[host].issues.filter((x) => x.kind === 'broken').slice(0, 3).map((x) => `${x.url.replace(/^https?:\/\/[^/]+/, '') || '/'} (${x.detail})`).join(', '), id: `broken:${host}:${now.slice(0, 10)}` });
  }
  await addAlerts(env, alerts);
}

// ---- tracked phrases (Search Console) and a traffic-drop check -------------------------------------------
export async function ranksRun(env, gsc) {
  const end = new Date(Date.now() - 2 * DAY);
  const dates = { startDate: iso(new Date(end.getTime() - 59 * DAY)), endDate: iso(end) };
  const out = [];
  let ok = 0;
  for (const kw of TRACKED_KEYWORDS) {
    const r = await gsc(env, RANK_PROPERTY, dates, ['date'], 100, { dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'contains', expression: kw }] }] });
    if (r.status === 200) ok++;
    // [date, clicks, impressions, ctr, position] -> [date, position, impressions, clicks]
    out.push({ kw, days: r.rows.filter((x) => x[2] > 0).map((x) => [x[0], x[4], x[2], x[1]]).sort((a, b) => (a[0] < b[0] ? -1 : 1)) });
  }
  if (ok) await env.DATA.put('ranks:file', JSON.stringify({ generatedAt: new Date().toISOString(), property: RANK_PROPERTY, keywords: out }));
  // Traffic drop: last 7 days of Google clicks against the 7 before.
  const a = await gsc(env, RANK_PROPERTY, { startDate: iso(new Date(end.getTime() - 6 * DAY)), endDate: iso(end) }, [], 1);
  const b = await gsc(env, RANK_PROPERTY, { startDate: iso(new Date(end.getTime() - 13 * DAY)), endDate: iso(new Date(end.getTime() - 7 * DAY)) }, [], 1);
  const cur = a.rows[0]?.[0] ?? 0, prev = b.rows[0]?.[0] ?? 0;
  if (a.status === 200 && b.status === 200 && prev >= 20 && cur < prev * 0.6) {
    await addAlerts(env, [{ kind: 'traffic', level: 'bad', title: `Google clicks fell ${Math.round((100 * (prev - cur)) / prev)}% this week`, detail: `${cur} clicks in the last 7 days, ${prev} in the 7 before.`, id: `traffic:${iso(end)}` }]);
  }
  return { ok };
}

// ---- failed workflows (GitHub) ----------------------------------------------------------------------------
export async function watchRuns(env, repos = WATCH_REPOS) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'analytics-api', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
  const seen = new Set((await kvJson(env, 'watch:seen')) || []);
  const alerts = [];
  for (const repo of repos) {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=50`, { headers }).catch(() => null);
    if (!res || !res.ok) continue;
    const latest = new Map();
    for (const r of (await res.json()).workflow_runs ?? []) if (!latest.has(r.path)) latest.set(r.path, r); // newest first
    for (const r of latest.values()) {
      if (r.conclusion !== 'failure' || seen.has(r.id)) continue;
      if (Date.now() - Date.parse(r.created_at) > 40 * 3600e3) continue; // the check is daily: older failures were reported already, or are history
      seen.add(r.id);
      alerts.push({ kind: 'workflow', level: 'bad', title: `${r.name} failed in ${repo.split('/')[1]}`, detail: r.display_title || '', id: `run:${r.id}` });
    }
  }
  await env.DATA.put('watch:seen', JSON.stringify([...seen].slice(-300)));
  await addAlerts(env, alerts);
  return alerts.length;
}
