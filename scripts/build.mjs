// Pulls Google Analytics 4 and Search Console data for every site, for several date ranges, and writes
// small JSON files under public/data/ that the dashboard loads lazily (only the range and source you open).
//   public/data/meta.json          ranges, key events, what could be read, API warnings
//   public/data/live.json          GA4 realtime (last 30 minutes)
//   public/data/ga-<range>.json    GA4 reports for one range (current period, plus the prior period totals)
//   public/data/gsc-<range>.json   Search Console for one range (current and prior period)
// No dependencies: Node 20+. Secret: GA_SERVICE_ACCOUNT_JSON. The files hold aggregate numbers only.
import crypto from 'node:crypto';
import fs from 'node:fs';

const PROPERTY = process.env.GA_PROPERTY_ID || '562159345';
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
  'https://calc.streamerosai.com/',
  'https://streamerosai.com/',
];
const KEY_EVENTS = ['whatsapp_click', 'email_click', 'phone_click', 'generate_lead', 'app_download', 'template_download', 'agreement_signed', 'calculator_use'];

const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('GA_SERVICE_ACCOUNT_JSON must be set as a repository secret.');
  process.exit(1);
}
const sa = JSON.parse(raw);
const errors = [];
const b64u = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}
const token = await accessToken();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// Run async tasks with a concurrency limit (GA4 allows 10 concurrent requests per property).
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

// POST with a few retries on quota and server errors.
async function post(url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    return { res, json: await res.json().catch(() => ({})) };
  }
  return { res: { ok: false, status: 599 }, json: { error: { message: 'retries exhausted' } } };
}

// ---------------------------------------------------------------- GA4
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
    mets: ['eventCount'],
    limit: 500,
    filter: inList('eventName', ['generate_lead', 'agreement_signed']),
  },
  eventsFirstTouch: { dims: ['hostName', 'eventName', 'customEvent:first_source', 'customEvent:first_medium'], mets: ['eventCount'], limit: 600, filter: keyEventFilter },
};

function gaRange(days, prev) {
  return prev ? { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` } : { startDate: `${days}daysAgo`, endDate: 'today' };
}
async function gaReport(label, spec, days) {
  const body = {
    dateRanges: [gaRange(days, spec.prev)],
    dimensions: spec.dims.map((name) => ({ name })),
    metrics: spec.mets.map((name) => ({ name })),
    limit: spec.limit || 250,
    keepEmptyRows: false,
    orderBys: spec.order || [{ metric: { metricName: spec.mets[0] }, desc: true }],
  };
  if (spec.filter) body.dimensionFilter = spec.filter;
  const { res, json } = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, body);
  if (!res.ok) {
    errors.push(`GA4 ${label}: ${json.error?.message ?? res.status}`);
    return { dims: spec.dims, mets: spec.mets, rows: [] };
  }
  const rows = (json.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]);
  return { dims: spec.dims, mets: spec.mets, rows };
}

async function realtime(dims, mets) {
  const { res, json } = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runRealtimeReport`, {
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    limit: 50,
  });
  if (!res.ok) {
    errors.push(`GA4 realtime: ${json.error?.message ?? res.status}`);
    return { dims, mets, rows: [] };
  }
  return { dims, mets, rows: (json.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]) };
}

// ---------------------------------------------------------------- Search Console
const iso = (d) => d.toISOString().slice(0, 10);
const DAY = 864e5;
function gscDates(days, prev) {
  const end = new Date(Date.now() - 2 * DAY - (prev ? days * DAY : 0)); // Search Console runs about two days behind
  const start = new Date(end.getTime() - (days - 1) * DAY);
  return { startDate: iso(start), endDate: iso(end) };
}
async function gsc(site, dates, dimensions, rowLimit) {
  const { res, json } = await post(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { ...dates, dimensions, rowLimit });
  if (!res.ok) return { status: res.status, rows: [] };
  return { status: 200, rows: (json.rows ?? []).map((r) => [...(r.keys ?? []), r.clicks, r.impressions, +(r.ctr * 100).toFixed(2), +r.position.toFixed(1)]) };
}
async function gscSite(site, range) {
  const cur = gscDates(range.days, false);
  const total = await gsc(site, cur, [], 1);
  if (total.status !== 200) return { ok: false, status: total.status };
  const prevTotal = await gsc(site, gscDates(range.days, true), [], 1);
  const big = range.days > 100 ? 1 : 0;
  return {
    ok: true,
    total: total.rows[0] ?? null,
    totalPrev: prevTotal.rows[0] ?? null,
    queries: (await gsc(site, cur, ['query'], big ? 500 : 250)).rows,
    pages: (await gsc(site, cur, ['page'], big ? 400 : 250)).rows,
    daily: (await gsc(site, cur, ['date'], 600)).rows,
    countries: (await gsc(site, cur, ['country'], 60)).rows,
    devices: (await gsc(site, cur, ['device'], 5)).rows,
    queryPage: (await gsc(site, cur, ['query', 'page'], big ? 500 : 300)).rows,
  };
}


// ---------------------------------------------------------------- Bing Webmaster Tools
// One key covers every site verified in the account. Fetched here (GitHub's addresses) because Bing throttles
// Cloudflare Workers' shared addresses. The API returns all history in one call, so each range is cut from that.
const BING = 'https://ssl.bing.com/webmaster/api.svc/json';
const bingDate = (v) => { const m = /\/Date\((-?\d+)/.exec(String(v || '')); return m ? new Date(+m[1]) : null; };
async function bingGet(method, params) {
  const u = new URL(`${BING}/${method}`);
  u.searchParams.set('apikey', process.env.BING_API_KEY);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const res = await fetch(u);
  if (!res.ok) return { status: res.status, rows: [], detail: (await res.text().catch(() => '')).slice(0, 200) };
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
function bingRange(raw, range) {
  const now = Date.now(), from = now - range.days * DAY, prevFrom = from - range.days * DAY;
  const at = (r) => { const d = bingDate(r.Date); return d ? d.getTime() : 0; };
  const cur = (r) => at(r) >= from && at(r) <= now, prev = (r) => at(r) >= prevFrom && at(r) < from;
  const sum = (rows, f) => rows.filter(f).reduce((a, r) => [a[0] + (+r.Clicks || 0), a[1] + (+r.Impressions || 0)], [0, 0]);
  const t = sum(raw.traffic, cur), tp = sum(raw.traffic, prev);
  const pos = bingAgg(raw.queries, () => 'x', cur)[0];
  const ctr = (a) => (a[1] ? +((100 * a[0]) / a[1]).toFixed(2) : 0);
  return {
    ok: true, url: raw.url, total: [t[0], t[1], ctr(t), pos ? pos[4] : 0], totalPrev: [tp[0], tp[1], ctr(tp), 0],
    daily: bingAgg(raw.traffic, (r) => { const d = bingDate(r.Date); return d ? iso(d) : ''; }, cur).map((r) => [r[0], r[1], r[2]]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    queries: bingAgg(raw.queries, (r) => r.Query, cur).slice(0, 250), pages: bingAgg(raw.pages, (r) => r.Query, cur).slice(0, 250),
  };
}
async function bingFetchAll() {
  if (!process.env.BING_API_KEY) return { raw: {}, error: 'BING_API_KEY is not set' };
  const list = await bingGet('GetUserSites');
  if (list.status !== 200) return { raw: {}, error: `Bing returned ${list.status}: ${list.detail || 'no detail'}` };
  const raw = {}; const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const s of list.rows.filter((r) => r.IsVerified !== false && r.Url)) {
    let host; try { host = new URL(s.Url).hostname; } catch { continue; }
    const traffic = await bingGet('GetRankAndTrafficStats', { siteUrl: s.Url }); await pause(400);
    const queries = await bingGet('GetQueryStats', { siteUrl: s.Url }); await pause(400);
    const pages = await bingGet('GetPageStats', { siteUrl: s.Url }); await pause(400);

    const crawl = await bingGet('GetCrawlStats', { siteUrl: s.Url }); await pause(400);
    if (traffic.status === 200 || queries.status === 200) raw[host] = { url: s.Url, traffic: traffic.rows, queries: queries.rows, pages: pages.rows, crawl: crawl.rows };
  }
  return { raw, error: Object.keys(raw).length ? null : 'Bing listed no readable sites' };
}


// ---------------------------------------------------------------- run
fs.mkdirSync('public/data', { recursive: true });
const write = (name, obj) => fs.writeFileSync(`public/data/${name}.json`, JSON.stringify(obj));
const generatedAt = new Date().toISOString();

// GA4: one file per range. Requests are throttled to stay under the concurrent-request limit.
for (const range of RANGES) {
  const names = Object.keys(PLAN);
  const results = await pool(names.map((n) => () => gaReport(`${range.id}/${n}`, PLAN[n], range.days)), 6);
  const reports = Object.fromEntries(names.map((n, i) => [n, results[i]]));
  write(`ga-${range.id}`, { range: range.id, days: range.days, generatedAt, reports });
}

// Search Console: one file per range, every property the service account can read.
const gscStatus = {};
for (const range of RANGES) {
  const results = await pool(GSC_SITES.map((s) => () => gscSite(s, range)), 3);
  const search = Object.fromEntries(GSC_SITES.map((s, i) => [s, results[i]]));
  GSC_SITES.forEach((s, i) => (gscStatus[s] = results[i].ok ? 'ok' : results[i].status));
  write(`gsc-${range.id}`, { range: range.id, days: range.days, generatedAt, search, ...gscDates(range.days, false) });
}

// Bing Webmaster Tools: one file per range. A failure writes a file that says why, so the page can show it.
const bing = await bingFetchAll();
if (bing.error) errors.push(`Bing: ${bing.error}`);
for (const range of RANGES) {
  const sites = Object.fromEntries(Object.entries(bing.raw).map(([h, raw]) => [h, bingRange(raw, range)]));
  write(`bing-${range.id}`, { range: range.id, days: range.days, generatedAt, sites, error: bing.error });
}

// Index health is computed by its own daily job (scripts/health.mjs) and committed as data/health.json; this run
// adds Bing's latest crawl stats and publishes both.
let health = { generatedAt, indexAt: null, index: {} };
try { health = { ...health, ...JSON.parse(fs.readFileSync('data/health.json', 'utf8')), generatedAt }; } catch { /* first run: no file yet */ }
const latest = (rows) => rows.slice().sort((a, b) => (bingDate(b.Date)?.getTime() ?? 0) - (bingDate(a.Date)?.getTime() ?? 0))[0];
health.bing = Object.fromEntries(Object.entries(bing.raw).map(([h, r]) => {
  const c = latest(r.crawl || []);
  return [h, c ? { date: bingDate(c.Date) ? iso(bingDate(c.Date)) : null, crawled: +c.CrawledPages || 0, errors: +c.CrawlErrors || 0, inIndex: +c.InIndex || 0, c4xx: +c.Code4xx || 0, c5xx: +c.Code5xx || 0, blocked: +c.BlockedByRobotsTxt || 0 } : null];
}));
write('health', health);

const live = {
  generatedAt,
  streams: await realtime(['streamName'], ['activeUsers', 'screenPageViews', 'eventCount']),
  pages: await realtime(['streamName', 'unifiedScreenName'], ['activeUsers']),
  countries: await realtime(['country'], ['activeUsers']),
  events: await realtime(['streamName', 'eventName'], ['eventCount']),
  devices: await realtime(['deviceCategory'], ['activeUsers']),
};
write('live', live);
write('meta', { generatedAt, property: PROPERTY, ranges: RANGES, keyEvents: KEY_EVENTS, gsc: gscStatus, errors: [...new Set(errors)].slice(0, 30) });
if (errors.length) console.warn(`Warnings (${errors.length}):\n${[...new Set(errors)].slice(0, 15).join('\n')}`);
const gscOk = Object.values(gscStatus).filter((s) => s === 'ok').length;
console.log(`Wrote ${RANGES.length} GA4 ranges, ${RANGES.length} Search Console ranges (${gscOk}/${GSC_SITES.length} properties readable), realtime, meta. ${errors.length} warnings.`);
