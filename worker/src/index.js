// analytics-api: live GA4 + Search Console data for analytics.streamerosai.com.
// Returns the same JSON files the GitHub Action publishes (meta, live, ga-<range>, gsc-<range>), but fetched
// from Google when the dashboard opens and cached for a few minutes. The Google service account key is a
// Worker secret (GA_SERVICE_ACCOUNT_JSON); it is never sent to the browser. Aggregate numbers only.

const PROPERTY = '562159345';
const RANGES = [
  { id: '7d', days: 7, label: 'Last 7 days' },
  { id: '28d', days: 28, label: 'Last 28 days' },
  { id: '3m', days: 90, label: 'Last 3 months' },
  { id: '6m', days: 180, label: 'Last 6 months' },
  { id: '12m', days: 365, label: 'Last 12 months' },
  { id: '16m', days: 480, label: 'Last 16 months' },
];
const GSC_SITES = [
  'sc-domain:streamerosai.com',
  'https://yk.streamerosai.com/',
  'https://fitrank.streamerosai.com/',
  'https://campus.streamerosai.com/',
  'https://spotai.streamerosai.com/',
  'https://tools.streamerosai.com/',
  'https://streamerosai.com/',
];
const KEY_EVENTS = ['whatsapp_click', 'email_click', 'phone_click', 'generate_lead', 'app_download', 'template_download', 'agreement_signed', 'calculator_use'];
// Cache lifetimes in seconds. GA4 standard reports and Search Console move slowly; realtime is the live part.
const TTL = { live: 45, ga: 300, gsc: 900, bing: 900, meta: 300 };
const ORIGIN_OK = /^(https:\/\/analytics\.streamerosai\.com|https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;

const inList = (field, values) => ({ filter: { fieldName: field, inListFilter: { values } } });
const keyEventFilter = inList('eventName', KEY_EVENTS);
const byDate = [{ dimension: { dimensionName: 'date' } }];
const M = ['sessions', 'activeUsers', 'keyEvents'];
const TOTAL_METS = ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'eventCount', 'keyEvents', 'userEngagementDuration'];
const PLAN = {
  totals: { dims: ['hostName'], mets: TOTAL_METS },
  totalsPrev: { dims: ['hostName'], mets: TOTAL_METS, prev: true },
  daily: { dims: ['date', 'hostName'], mets: ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'], limit: 5000, order: byDate },
  channels: { dims: ['hostName', 'sessionDefaultChannelGroup'], mets: [...M, 'engagedSessions', 'newUsers'] },
  sourceMedium: { dims: ['hostName', 'sessionSource', 'sessionMedium'], mets: [...M, 'newUsers', 'engagedSessions'], limit: 600 },
  campaigns: { dims: ['hostName', 'sessionCampaignName', 'sessionSourceMedium'], mets: [...M, 'engagedSessions'], limit: 300 },
  campaignContent: { dims: ['hostName', 'sessionManualAdContent', 'sessionManualTerm'], mets: ['sessions', 'keyEvents'], limit: 200 },
  firstTouch: { dims: ['hostName', 'firstUserSource', 'firstUserMedium', 'firstUserCampaignName'], mets: ['newUsers', 'sessions', 'keyEvents'], limit: 400 },
  referrers: { dims: ['hostName', 'pageReferrer'], mets: ['screenPageViews', 'activeUsers'], limit: 400 },
  landing: { dims: ['hostName', 'landingPage'], mets: ['sessions', 'engagedSessions', 'keyEvents', 'activeUsers'], limit: 500 },
  landingSource: { dims: ['hostName', 'landingPage', 'sessionSourceMedium'], mets: ['sessions', 'keyEvents'], limit: 600 },
  pages: { dims: ['hostName', 'pagePath'], mets: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'keyEvents'], limit: 600 },
  countries: { dims: ['hostName', 'country'], mets: ['sessions', 'activeUsers', 'keyEvents'], limit: 500 },
  cities: { dims: ['hostName', 'country', 'city'], mets: ['sessions', 'keyEvents'], limit: 400 },
  devices: { dims: ['hostName', 'deviceCategory'], mets: ['sessions', 'activeUsers', 'keyEvents'] },
  browsers: { dims: ['hostName', 'browser'], mets: ['sessions', 'keyEvents'], limit: 150 },
  os: { dims: ['hostName', 'operatingSystem'], mets: ['sessions', 'keyEvents'], limit: 150 },
  languages: { dims: ['hostName', 'language'], mets: ['sessions', 'keyEvents'], limit: 150 },
  newReturning: { dims: ['hostName', 'newVsReturning'], mets: ['sessions', 'activeUsers', 'keyEvents'] },
  weekday: { dims: ['hostName', 'dayOfWeek'], mets: ['sessions', 'keyEvents'], limit: 100, order: [{ dimension: { dimensionName: 'dayOfWeek' } }] },
  hour: { dims: ['hostName', 'hour'], mets: ['sessions', 'keyEvents'], limit: 400, order: [{ dimension: { dimensionName: 'hour' } }] },
  events: { dims: ['hostName', 'eventName'], mets: ['eventCount', 'totalUsers', 'keyEvents'], limit: 600 },
  keyEventsDaily: { dims: ['date', 'hostName', 'eventName'], mets: ['eventCount'], limit: 20000, filter: keyEventFilter, order: byDate },
  keyEventsBySource: { dims: ['hostName', 'eventName', 'sessionSource', 'sessionMedium'], mets: ['eventCount'], limit: 600, filter: keyEventFilter },
  keyEventsByPage: { dims: ['hostName', 'eventName', 'pagePath'], mets: ['eventCount'], limit: 700, filter: keyEventFilter },
  ctaText: { dims: ['hostName', 'eventName', 'customEvent:cta_text'], mets: ['eventCount'], limit: 600, filter: keyEventFilter },
  forms: { dims: ['hostName', 'eventName', 'customEvent:form_name'], mets: ['eventCount'], limit: 200, filter: inList('eventName', ['generate_lead', 'agreement_signed']) },
  leadsFirstTouch: {
    dims: ['hostName', 'customEvent:first_source', 'customEvent:first_medium', 'customEvent:first_campaign', 'customEvent:form_name'],
    mets: ['eventCount'], limit: 500, filter: inList('eventName', ['generate_lead', 'agreement_signed']),
  },
  eventsFirstTouch: { dims: ['hostName', 'eventName', 'customEvent:first_source', 'customEvent:first_medium'], mets: ['eventCount'], limit: 600, filter: keyEventFilter },
};

// ---- Google auth (service account JWT, RS256 via WebCrypto) ----
let tokenCache = { value: '', exp: 0 };
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
async function accessToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  const sa = JSON.parse(env.GA_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64uStr(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token ' + JSON.stringify(j).slice(0, 200));
  tokenCache = { value: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return j.access_token;
}

async function post(env, url, body) {
  const token = await accessToken(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      // A Google call that never answers must not hold the whole report hostage.
      res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    } catch {
      return { res: { ok: false, status: 598 }, json: { error: { message: 'timed out' } } };
    }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); continue; }
    return { res, json: await res.json().catch(() => ({})) };
  }
  return { res: { ok: false, status: 599 }, json: { error: { message: 'retries exhausted' } } };
}
// Run tasks with a concurrency limit (Workers allow 6 open connections per request).
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } }));
  return out;
}

// ---- GA4 ----
const gaRange = (days, prev) => (prev ? { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` } : { startDate: `${days}daysAgo`, endDate: 'today' });
async function gaReport(env, label, spec, days, errors, deadline) {
  if (Date.now() > deadline) { errors.push(`GA4 ${label}: skipped, out of time`); return { dims: spec.dims, mets: spec.mets, rows: [] }; }
  const body = {
    dateRanges: [gaRange(days, spec.prev)],
    dimensions: spec.dims.map((name) => ({ name })), metrics: spec.mets.map((name) => ({ name })),
    limit: spec.limit || 250, keepEmptyRows: false,
    orderBys: spec.order || [{ metric: { metricName: spec.mets[0] }, desc: true }],
  };
  if (spec.filter) body.dimensionFilter = spec.filter;
  const { res, json } = await post(env, `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, body);
  if (!res.ok) { errors.push(`GA4 ${label}: ${json.error?.message ?? res.status}`); return { dims: spec.dims, mets: spec.mets, rows: [] }; }
  return { dims: spec.dims, mets: spec.mets, rows: (json.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]) };
}
async function realtime(env, dims, mets, errors) {
  const { res, json } = await post(env, `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runRealtimeReport`, {
    dimensions: dims.map((name) => ({ name })), metrics: mets.map((name) => ({ name })), limit: 50,
  });
  if (!res.ok) { errors.push(`GA4 realtime: ${json.error?.message ?? res.status}`); return { dims, mets, rows: [] }; }
  return { dims, mets, rows: (json.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]) };
}

// ---- Search Console ----
const iso = (d) => d.toISOString().slice(0, 10);
const DAY = 864e5;
function gscDates(days, prev) {
  const end = new Date(Date.now() - 2 * DAY - (prev ? days * DAY : 0));
  return { startDate: iso(new Date(end.getTime() - (days - 1) * DAY)), endDate: iso(end) };
}
async function gsc(env, site, dates, dimensions, rowLimit) {
  const { res, json } = await post(env, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { ...dates, dimensions, rowLimit });
  if (!res.ok) return { status: res.status, rows: [] };
  return { status: 200, rows: (json.rows ?? []).map((r) => [...(r.keys ?? []), r.clicks, r.impressions, +(r.ctr * 100).toFixed(2), +r.position.toFixed(1)]) };
}
async function gscSite(env, site, range) {
  const cur = gscDates(range.days, false);
  const total = await gsc(env, site, cur, [], 1);
  if (total.status !== 200) return { ok: false, status: total.status };
  const big = range.days > 100 ? 1 : 0;
  const [prevTotal, queries, pages, daily, countries, devices, queryPage] = await Promise.all([
    gsc(env, site, gscDates(range.days, true), [], 1), gsc(env, site, cur, ['query'], big ? 500 : 250), gsc(env, site, cur, ['page'], big ? 400 : 250),
    gsc(env, site, cur, ['date'], 600), gsc(env, site, cur, ['country'], 60), gsc(env, site, cur, ['device'], 5), gsc(env, site, cur, ['query', 'page'], big ? 500 : 300),
  ]);
  return { ok: true, total: total.rows[0] ?? null, totalPrev: prevTotal.rows[0] ?? null, queries: queries.rows, pages: pages.rows, daily: daily.rows, countries: countries.rows, devices: devices.rows, queryPage: queryPage.rows };
}

// ---- Bing Webmaster Tools ----
// The API key is a Worker secret (BING_API_KEY). One key covers every site verified in the account. Bing reports
// less history than Google and some series are weekly, so the numbers are close to, not the same as, Search Console.
const BING = 'https://ssl.bing.com/webmaster/api.svc/json';
const bingDate = (v) => { const m = /\/Date\((-?\d+)/.exec(String(v || '')); return m ? new Date(+m[1]) : null; };
async function bingGet(env, method, params) {
  const u = new URL(`${BING}/${method}`);
  u.searchParams.set('apikey', env.BING_API_KEY);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const res = await fetch(u);
  if (!res.ok) return { status: res.status, rows: [], detail: (await res.text().catch(() => '')).slice(0, 300) };
  const j = await res.json().catch(() => ({}));
  return { status: 200, rows: Array.isArray(j.d) ? j.d : j.d ? [j.d] : [] };
}
function bingAgg(rows, keyOf, inRange) {
  const map = new Map();
  for (const r of rows) {
    if (!inRange(r)) continue;
    const k = keyOf(r); if (!k) continue;
    const o = map.get(k) || { c: 0, i: 0, pw: 0 };
    const imp = +r.Impressions || 0;
    o.c += +r.Clicks || 0; o.i += imp; o.pw += (+r.AvgImpressionPosition || 0) * imp;
    map.set(k, o);
  }
  return [...map.entries()].map(([k, o]) => [k, o.c, o.i, o.i ? +((100 * o.c) / o.i).toFixed(2) : 0, o.i ? +(o.pw / o.i).toFixed(1) : 0]).sort((a, b) => b[1] - a[1] || b[2] - a[2]);
}
async function bingSite(env, siteUrl, range) {
  const now = Date.now(), from = now - range.days * DAY, prevFrom = from - range.days * DAY;
  const [traffic, queries, pages] = await Promise.all([bingGet(env, 'GetRankAndTrafficStats', { siteUrl }), bingGet(env, 'GetQueryStats', { siteUrl }), bingGet(env, 'GetPageStats', { siteUrl })]);
  if (traffic.status !== 200 && queries.status !== 200) return { ok: false, status: traffic.status };
  const at = (r) => { const d = bingDate(r.Date); return d ? d.getTime() : 0; };
  const cur = (r) => at(r) >= from && at(r) <= now, prev = (r) => at(r) >= prevFrom && at(r) < from;
  const sum = (rows, f) => rows.filter(f).reduce((a, r) => [a[0] + (+r.Clicks || 0), a[1] + (+r.Impressions || 0)], [0, 0]);
  const t = sum(traffic.rows, cur), tp = sum(traffic.rows, prev);
  const posOf = (rows) => { const a = bingAgg(rows, () => 'x', cur)[0]; return a ? a[4] : 0; };
  const total = [t[0], t[1], t[1] ? +((100 * t[0]) / t[1]).toFixed(2) : 0, posOf(queries.rows)];
  const daily = bingAgg(traffic.rows, (r) => { const d = bingDate(r.Date); return d ? iso(d) : ''; }, cur).map((r) => [r[0], r[1], r[2]]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    ok: true, total, totalPrev: [tp[0], tp[1], tp[1] ? +((100 * tp[0]) / tp[1]).toFixed(2) : 0, 0], daily,
    queries: bingAgg(queries.rows, (r) => r.Query, cur).slice(0, 250), pages: bingAgg(pages.rows, (r) => r.Query, cur).slice(0, 250),
  };
}
async function bingBuild(env, range) {
  if (!env.BING_API_KEY) return { range: range.id, days: range.days, generatedAt: new Date().toISOString(), sites: {}, error: 'BING_API_KEY is not set' };
  const list = await bingGet(env, 'GetUserSites');
  if (list.status !== 200) return null; // throttled or rejected: let the dashboard keep the published copy
  const urls = list.rows.filter((r) => r.IsVerified !== false).map((r) => r.Url).filter(Boolean);
  const results = await pool(urls.map((u) => () => bingSite(env, u, range)), 3);
  const sites = {};
  urls.forEach((u, i) => { try { sites[new URL(u).hostname] = { url: u, ...results[i] }; } catch { /* skip a malformed url */ } });
  return { range: range.id, days: range.days, generatedAt: new Date().toISOString(), sites, listStatus: list.status, ...(list.detail ? { detail: list.detail } : {}) };
}

// ---- routes ----
async function build(kind, id, env) {
  const generatedAt = new Date().toISOString();
  const errors = [];
  if (kind === 'meta') return { generatedAt, property: PROPERTY, ranges: RANGES, keyEvents: KEY_EVENTS, errors, live: true };
  if (kind === 'live') {
    const [streams, pages, countries, events, devices] = await Promise.all([
      realtime(env, ['streamName'], ['activeUsers', 'screenPageViews', 'eventCount'], errors), realtime(env, ['streamName', 'unifiedScreenName'], ['activeUsers'], errors),
      realtime(env, ['country'], ['activeUsers'], errors), realtime(env, ['streamName', 'eventName'], ['eventCount'], errors), realtime(env, ['deviceCategory'], ['activeUsers'], errors),
    ]);
    return { generatedAt, streams, pages, countries, events, devices, live: true };
  }
  const range = RANGES.find((r) => r.id === id);
  if (!range) return null;
  if (kind === 'ga') {
    const names = Object.keys(PLAN);
    const deadline = Date.now() + 40000;
    const results = await pool(names.map((n) => () => gaReport(env, `${range.id}/${n}`, PLAN[n], range.days, errors, deadline)), 6);
    return { range: range.id, days: range.days, generatedAt, reports: Object.fromEntries(names.map((n, i) => [n, results[i]])), errors, live: true };
  }
  if (kind === 'gsc') {
    const results = await pool(GSC_SITES.map((s) => () => gscSite(env, s, range)), 3);
    return { range: range.id, days: range.days, generatedAt, search: Object.fromEntries(GSC_SITES.map((s, i) => [s, results[i]])), ...gscDates(range.days, false), live: true };
  }
  if (kind === 'bing') return bingBuild(env, range);
  return null;
}


// ---- owner-only re-run of a GitHub Actions workflow ----
// The dashboard is public, so this is the one write action and it is locked three ways: it answers only the dashboard's own
// origin, it needs the owner's key (RERUN_KEY, a Worker secret), and it can start only the two workflows listed here.
// GITHUB_TOKEN is a fine-grained token limited to this repository's Actions. Neither secret ever reaches the browser.
const REPO = 'Yaseenyk/analytics-dashboard';
const RERUNS = { health: 'health.yml', dashboard: 'dashboard.yml' };
const lastRerun = new Map();
function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function rerun(req, env, ch) {
  const json = (o, status) => new Response(JSON.stringify(o), { status, headers: { ...ch, 'Content-Type': 'application/json' } });
  const name = new URL(req.url).pathname.split('/').pop();
  if (req.headers.get('Origin') !== 'https://analytics.streamerosai.com') return json({ error: 'not allowed from this origin' }, 403);
  if (!env.RERUN_KEY || !env.GITHUB_TOKEN) return json({ error: 'Re-run is not set up yet (missing RERUN_KEY or GITHUB_TOKEN).' }, 503);
  if (!sameKey(req.headers.get('X-Rerun-Key') || '', env.RERUN_KEY)) return json({ error: 'wrong key' }, 401);
  const file = RERUNS[name];
  if (!file) return json({ error: 'unknown job' }, 404);
  const last = lastRerun.get(name) || 0;
  if (Date.now() - last < 60000) return json({ error: 'started a moment ago, wait a minute' }, 429);
  lastRerun.set(name, Date.now());
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${file}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'analytics-api', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) return json({ error: `GitHub answered ${res.status}`, detail: (await res.text()).slice(0, 200) }, 502);
  return json({ ok: true, job: name }, 202);
}

const memo = new Map(); // in-isolate cache: key -> { at, body }
const inflight = new Map();
function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { 'Vary': 'Origin' };
  if (ORIGIN_OK.test(o)) { h['Access-Control-Allow-Origin'] = o; h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; h['Access-Control-Allow-Headers'] = 'X-Rerun-Key, Content-Type'; h['Access-Control-Max-Age'] = '86400'; }
  return h;
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const ch = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    if (url.pathname === '/health') return new Response('ok', { headers: ch });
    if (req.method === 'POST' && url.pathname.startsWith('/rerun/')) return rerun(req, env, ch);
    const m = url.pathname.match(/^\/data\/(meta|live|ga|gsc|bing)(?:-([a-z0-9]+))?\.json$/);
    if (!m || req.method !== 'GET') return new Response('not found', { status: 404, headers: ch });
    const kind = m[1], id = m[2] || '', key = kind + id;
    const ttl = (TTL[kind] || 60) * 1000, hit = memo.get(key);
    let body;
    if (hit && Date.now() - hit.at < ttl) body = hit.body;
    else {
      try {
        let p = inflight.get(key);
        if (!p) { p = build(kind, id, env).then((o) => (o ? JSON.stringify(o) : null)).finally(() => inflight.delete(key)); inflight.set(key, p); }
        body = await p;
        if (body) memo.set(key, { at: Date.now(), body });
      } catch (e) {
        if (hit) body = hit.body; // serve the last good copy if Google is unreachable
        else return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: { ...ch, 'Content-Type': 'application/json' } });
      }
    }
    if (!body) return new Response('not found', { status: 404, headers: ch });
    return new Response(body, { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.min(60, TTL[kind] || 60)}` } });
  },
};
