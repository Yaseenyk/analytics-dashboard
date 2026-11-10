// analytics-api: live GA4 + Search Console data for analytics.streamerosai.com.
// Returns the same JSON files the GitHub Action publishes (meta, live, ga-<range>, gsc-<range>), but fetched
// from Google when the dashboard opens and cached for a few minutes. The Google service account key is a
// Worker secret (GA_SERVICE_ACCOUNT_JSON); it is never sent to the browser. Aggregate numbers only.

import { addAlerts, crawlStart, crawlStatus, crawlTick, ranksRun, recordHealth, watchRuns } from './insights.js';

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
  'https://solar.streamerosai.com/',
  'https://exams.streamerosai.com/',
  'https://calc.streamerosai.com/',
  'https://images.streamerosai.com/',
  'https://math.streamerosai.com/',
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
  // Google Ads (linked to the property on 10 Nov 2026). Ad metrics cannot be split by hostName, so these cover all sites.
  adsCampaigns: { dims: ['sessionGoogleAdsCampaignName'], mets: ['advertiserAdImpressions', 'advertiserAdClicks', 'advertiserAdCost', 'sessions', 'keyEvents'], limit: 200 },
  adsDaily: { dims: ['date', 'sessionCampaignName'], mets: ['advertiserAdImpressions', 'advertiserAdClicks', 'advertiserAdCost'], limit: 5000, order: byDate },
  adsKeywords: { dims: ['sessionGoogleAdsKeyword'], mets: ['advertiserAdClicks', 'advertiserAdCost', 'sessions', 'keyEvents'], limit: 200 },
  adsGroups: { dims: ['sessionGoogleAdsCampaignName', 'sessionGoogleAdsAdGroupName'], mets: ['advertiserAdClicks', 'advertiserAdCost', 'sessions'], limit: 200 },
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
async function gsc(env, site, dates, dimensions, rowLimit, extra = {}) {
  const { res, json } = await post(env, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { ...dates, dimensions, rowLimit, ...extra });
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


// ---- index health, run by the Worker itself (cron + KV), no GitHub Actions ----
// Asks Google's URL Inspection API whether each sitemap page is indexed. One call per page, so it is done in small batches:
// a cron tick every minute inspects the next HEALTH_BATCH pages and saves its place in KV. (The free plan allows 50 outgoing
// requests per invocation; a failed tick saves nothing, so the next tick simply repeats the same batch.) It starts every day
// at 02:40 UTC, or when someone presses Re-run. Result: KV key health:file, served at /data/health.json.
const HEALTH_SITES = {
  'yk.streamerosai.com': 'https://yk.streamerosai.com/',
  'campus.streamerosai.com': 'https://campus.streamerosai.com/',
  'streamerosai.com': 'https://streamerosai.com/',
  'fitrank.streamerosai.com': 'https://fitrank.streamerosai.com/',
  'spotai.streamerosai.com': 'https://spotai.streamerosai.com/',
  'tools.streamerosai.com': 'https://tools.streamerosai.com/',
  'solar.streamerosai.com': 'https://solar.streamerosai.com/',
  'calc.streamerosai.com': 'https://calc.streamerosai.com/',
  'images.streamerosai.com': 'https://images.streamerosai.com/',
  'math.streamerosai.com': 'https://math.streamerosai.com/',
  'exams.streamerosai.com': 'https://exams.streamerosai.com/',
};
const HEALTH_BATCH = 25;
const HEALTH_COOLDOWN_MIN = 90;
const kvJson = async (env, key) => { const v = await env.DATA.get(key); return v ? JSON.parse(v) : null; };

async function sitemapUrlsFor(host) {
  const out = [], seen = new Set(), todo = [`https://${host}/sitemap.xml`];
  while (todo.length) {
    const u = todo.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    const res = await fetch(u).catch(() => null);
    if (!res || !res.ok) { if (u.endsWith('/sitemap.xml') && !seen.has(`https://${host}/sitemap-index.xml`)) todo.push(`https://${host}/sitemap-index.xml`); continue; }
    const xml = await res.text();
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) (m[1].endsWith('.xml') ? todo : out).push(m[1]);
  }
  return [...new Set(out)];
}
async function inspectOne(env, property, url) {
  const { res, json } = await post(env, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: property });
  if (!res.ok) return [url, `Could not inspect (${res.status})`, 'ERROR', null];
  const r = json.inspectionResult?.indexStatusResult ?? {};
  return [url, r.coverageState || 'Unknown', r.verdict || 'UNKNOWN', r.lastCrawlTime ? r.lastCrawlTime.slice(0, 10) : null];
}
async function healthStart(env, trigger) {
  await env.DATA.put('health:state', JSON.stringify({ stage: 'plan', startedAt: Date.now(), trigger, queue: [], results: {}, total: 0 }));
  await env.DATA.put('health:lastStart', String(Date.now()));
}
async function healthTick(env) {
  const st = await kvJson(env, 'health:state');
  if (!st) return;
  if (st.stage === 'plan') {
    const lists = await Promise.all(Object.keys(HEALTH_SITES).map((h) => sitemapUrlsFor(h)));
    st.queue = Object.keys(HEALTH_SITES).flatMap((h, i) => lists[i].map((u) => [h, u]));
    st.total = st.queue.length;
    st.stage = 'inspect';
    await env.DATA.put('health:state', JSON.stringify(st));
    return;
  }
  const batch = st.queue.splice(0, HEALTH_BATCH);
  const rows = await pool(batch.map(([h, u]) => () => inspectOne(env, HEALTH_SITES[h], u)), 6);
  batch.forEach(([h], i) => (st.results[h] = st.results[h] || []).push(rows[i]));
  if (st.queue.length) { await env.DATA.put('health:state', JSON.stringify(st)); return; }
  // Done: summarise per site and publish.
  const index = {};
  for (const [h, property] of Object.entries(HEALTH_SITES)) {
    const r = st.results[h] || [];
    const byState = {};
    r.forEach((x) => (byState[x[1]] = (byState[x[1]] || 0) + 1));
    const indexed = r.filter((x) => x[2] === 'PASS').length;
    index[h] = { property, inspected: r.length, indexed, notIndexed: r.length - indexed, byState, urls: r.filter((x) => x[2] !== 'PASS').map((x) => [x[0], x[1], x[3]]).slice(0, 1000), indexedUrls: r.filter((x) => x[2] === 'PASS').map((x) => x[0]) };
  }
  const prior = await fetch('https://analytics.streamerosai.com/data/health.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const now = new Date().toISOString();
  const before = await kvJson(env, 'health:file');
  await recordHealth(env, before, index, now).catch((e) => console.log('history failed:', String((e && e.message) || e)));
  await env.DATA.put('health:file', JSON.stringify({ generatedAt: now, indexAt: now, index, ...(prior?.bing ? { bing: prior.bing } : {}) }));
  await env.DATA.delete('health:state');
}
async function healthStatus(env) {
  const st = await kvJson(env, 'health:state');
  const file = await kvJson(env, 'health:file');
  const last = Number(await env.DATA.get('health:lastStart')) || 0;
  return {
    running: !!st, stage: st?.stage ?? null, done: st ? st.total - st.queue.length : 0, total: st?.total ?? 0, startedAt: st?.startedAt ?? null, trigger: st?.trigger ?? null,
    lastFinished: file?.indexAt ?? null, lastStart: last || null, cooldownMin: HEALTH_COOLDOWN_MIN,
  };
}

// ---- re-run ----
// Anyone who opens the dashboard can press Re-run; there is no login. What keeps it safe is a cooldown, because Google caps
// how many pages the index check may inspect in a day and a stranger spamming the button could use that up. The cooldown is
// read from GitHub's own record of the last run, so it holds for every IP address and every copy of this Worker.
// GITHUB_TOKEN is a fine-grained token limited to this repository's Actions. It never reaches the browser.
const REPO = 'Yaseenyk/analytics-dashboard';
const RERUNS = { dashboard: { file: 'dashboard.yml', cooldownMin: 10 } };
const lastRerun = new Map();
async function rerun(req, env, ch, ctx) {
  const json = (o, status) => new Response(JSON.stringify(o), { status, headers: { ...ch, 'Content-Type': 'application/json' } });
  const name = new URL(req.url).pathname.split('/').pop();
  if (req.headers.get('Origin') !== 'https://analytics.streamerosai.com') return json({ error: 'not allowed from this origin' }, 403);
  if (name === 'health') {
    const st = await healthStatus(env);
    if (st.running) return json({ error: `It is already running (${st.done} of ${st.total || '…'} pages checked).` }, 409);
    const age = (Date.now() - (st.lastStart || 0)) / 60000;
    if (age < HEALTH_COOLDOWN_MIN) return json({ error: `It started ${Math.max(1, Math.round(age))} min ago. You can start it again in ${Math.ceil(HEALTH_COOLDOWN_MIN - age)} min.` }, 429);
    await healthStart(env, 'manual');
    ctx.waitUntil(healthTick(env).catch(() => {}));
    return json({ ok: true, job: 'health' }, 202);
  }
  if (name === 'insights') {
    // Tracked phrases, traffic check and failed-workflow check, outside their nightly slot. They only read Search Console and GitHub.
    const last = Number(await env.DATA.get('insights:lastStart')) || 0;
    if (Date.now() - last < 30 * 60000) return json({ error: 'It ran less than 30 minutes ago.' }, 429);
    await env.DATA.put('insights:lastStart', String(Date.now()));
    ctx.waitUntil(Promise.all([ranksRun(env, gsc), watchRuns(env)]).catch(() => {}));
    return json({ ok: true, job: 'insights' }, 202);
  }
  if (name === 'crawl') {
    const st = await crawlStatus(env);
    if (st.running) return json({ error: `It is already running (${st.done} of ${st.total || '…'} pages checked).` }, 409);
    const age = (Date.now() - (st.lastStart || 0)) / 60000;
    if (age < CRAWL_COOLDOWN_MIN) return json({ error: `It started ${Math.max(1, Math.round(age))} min ago. You can start it again in ${Math.ceil(CRAWL_COOLDOWN_MIN - age)} min.` }, 429);
    await crawlStart(env, 'manual');
    ctx.waitUntil(crawlTick(env, crawlHooks).catch(() => {}));
    return json({ ok: true, job: 'crawl' }, 202);
  }
  if (!env.GITHUB_TOKEN) return json({ error: 'Re-run is not set up yet (the Worker has no GITHUB_TOKEN).' }, 503);
  const job = RERUNS[name];
  if (!job) return json({ error: 'unknown job' }, 404);
  const gh = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'analytics-api', 'X-GitHub-Api-Version': '2022-11-28' };
  // Two presses in the same second would both see "no run yet", so also hold this copy of the Worker for a short moment.
  if (Date.now() - (lastRerun.get(name) || 0) < 15000) return json({ error: 'Started a moment ago.' }, 429);
  lastRerun.set(name, Date.now());
  const runs = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${job.file}/runs?per_page=1`, { headers: gh });
  const last = runs.ok ? (await runs.json()).workflow_runs?.[0] : null;
  if (last) {
    if (last.status !== 'completed') return json({ error: 'It is already running.' }, 409);
    const age = (Date.now() - Date.parse(last.created_at)) / 60000;
    if (age < job.cooldownMin) return json({ error: `It last ran ${Math.max(1, Math.round(age))} min ago. You can start it again in ${Math.ceil(job.cooldownMin - age)} min.` }, 429);
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${job.file}/dispatches`, {
    method: 'POST', headers: { ...gh, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) return json({ error: `GitHub answered ${res.status}`, detail: (await res.text()).slice(0, 200) }, 502);
  return json({ ok: true, job: name }, 202);
}

const memo = new Map(); // in-isolate cache: key -> { at, body }
// ---- content optimizer: the pull requests it opened, and a Merge / Decline button for the owner ----
// The GitHub token (OPTIMIZER_GITHUB_TOKEN) and the owner's passphrase (MERGE_PASSPHRASE) are Worker secrets. The dashboard
// is public, so an action needs the passphrase in X-Passphrase; it is compared by hash. Only branches named optimizer/* can
// be touched, and only in these repositories.
const OPT_REPOS = ['Yaseenyk/portfolio', 'Yaseenyk/streamer-os-website', 'Yaseenyk/fitrank-website', 'Yaseenyk/campus-site', 'Yaseenyk/spotai-website', 'Yaseenyk/solar-site', 'Yaseenyk/exams'];
const ghHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'analytics-api', 'X-GitHub-Api-Version': '2022-11-28' });
async function sha256(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function optimizerPrs(env) {
  if (!env.OPTIMIZER_GITHUB_TOKEN) return { prs: [], error: 'no token' };
  const h = ghHeaders(env.OPTIMIZER_GITHUB_TOKEN);
  const prs = [];
  const errors = [];
  for (const repo of OPT_REPOS) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=30`, { headers: h }).catch(() => null);
    if (!res || !res.ok) { errors.push(`${repo}: ${res ? res.status : 'no answer'}`); continue; }
    for (const pr of await res.json()) {
      if (!pr.head?.ref?.startsWith('optimizer/') || prs.length >= 30) continue;
      let checks = 'none';
      const cr = await fetch(`https://api.github.com/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=30`, { headers: h }).catch(() => null);
      if (cr && cr.ok) {
        const runs = (await cr.json()).check_runs || [];
        checks = !runs.length ? 'none' : runs.some((r) => r.status !== 'completed') ? 'pending' : runs.every((r) => ['success', 'neutral', 'skipped'].includes(r.conclusion)) ? 'success' : 'failure';
      }
      prs.push({ repo, number: pr.number, title: pr.title, url: pr.html_url, body: pr.body || '', branch: pr.head.ref, created: pr.created_at, checks });
    }
  }
  return { prs, errors };
}
async function optimizerAction(req, env, ch) {
  const json = (o, status) => new Response(JSON.stringify(o), { status, headers: { ...ch, 'Content-Type': 'application/json' } });
  if (req.headers.get('Origin') !== 'https://analytics.streamerosai.com') return json({ error: 'not allowed from this origin' }, 403);
  if (!env.OPTIMIZER_GITHUB_TOKEN) return json({ error: 'The Worker has no GitHub token yet.' }, 503);
  if (!env.MERGE_PASSPHRASE) return json({ error: 'No passphrase is set on the Worker yet.' }, 503);
  const pass = req.headers.get('X-Passphrase') || '';
  if (!pass || (await sha256(pass)) !== (await sha256(env.MERGE_PASSPHRASE))) return json({ error: 'Wrong passphrase.' }, 401);
  const body = await req.json().catch(() => ({}));
  const { repo, number, action } = body;
  if (!OPT_REPOS.includes(repo) || !Number.isInteger(number) || !['merge', 'close'].includes(action)) return json({ error: 'bad request' }, 400);
  const h = ghHeaders(env.OPTIMIZER_GITHUB_TOKEN);
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, { headers: h });
  if (!prRes.ok) return json({ error: `GitHub answered ${prRes.status} for that pull request.` }, 502);
  const pr = await prRes.json();
  if (!pr.head?.ref?.startsWith('optimizer/')) return json({ error: 'Only pull requests opened by the optimizer can be handled here.' }, 403);
  if (pr.state !== 'open') return json({ error: 'That pull request is already closed.' }, 409);
  if (action === 'merge') {
    const m = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}/merge`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ merge_method: 'squash', commit_title: pr.title }) });
    const mj = await m.json().catch(() => ({}));
    if (!m.ok) return json({ error: mj.message || `GitHub answered ${m.status}.` }, 502);
    return json({ ok: true, merged: true, sha: mj.sha || null }, 200);
  }
  const c = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed' }) });
  if (!c.ok) return json({ error: `GitHub answered ${c.status}.` }, 502);
  await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${pr.head.ref}`, { method: 'DELETE', headers: h }).catch(() => {});
  return json({ ok: true, closed: true }, 200);
}

const crawlHooks = { hosts: Object.keys(HEALTH_SITES), sitemapUrlsFor, pool };
const CRAWL_COOLDOWN_MIN = 90;
const KV_FILES = { 'history.json': 'history:index', 'alerts.json': 'alerts', 'ranks.json': 'ranks:file', 'crawl.json': 'crawl:file' };

const inflight = new Map();
function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { 'Vary': 'Origin' };
  if (ORIGIN_OK.test(o)) { h['Access-Control-Allow-Origin'] = o; h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; h['Access-Control-Allow-Headers'] = 'Content-Type, X-Passphrase'; h['Access-Control-Max-Age'] = '86400'; }
  return h;
}
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // One job per tick: a running index check goes first, then a running site check. Daily jobs start at fixed minutes
      // (UTC): 02:20 tracked phrases and traffic check, 02:25 failed-workflow check, 02:40 index check, 02:45 site check.
      const d = new Date(event.scheduledTime);
      const at = d.getUTCHours() * 100 + d.getUTCMinutes();
      if (at === 245) return crawlStart(env, 'schedule'); // only queues it: the index check, if still running, goes first
      if (!(await env.DATA.get('health:state')) && !(await env.DATA.get('crawl:state'))) {
        if (at === 220) return ranksRun(env, gsc);
        if (at === 225) return watchRuns(env);
        if (at === 240) { await healthStart(env, 'schedule'); return healthTick(env); }
      }
      if (await env.DATA.get('health:state')) return healthTick(env);
      if (await env.DATA.get('crawl:state')) return crawlTick(env, crawlHooks);
    })().catch((e) => console.log('daily tick failed:', String((e && e.message) || e))));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ch = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    if (url.pathname === '/health') return new Response('ok', { headers: ch });
    if (req.method === 'POST' && url.pathname.startsWith('/rerun/')) return rerun(req, env, ch, ctx);
    if (url.pathname === '/status/health' && req.method === 'GET') {
      return new Response(JSON.stringify(await healthStatus(env)), { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/optimizer/prs' && req.method === 'GET') {
      return new Response(JSON.stringify(await optimizerPrs(env)), { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/optimizer/action' && req.method === 'POST') return optimizerAction(req, env, ch);
    if (url.pathname === '/status/crawl' && req.method === 'GET') {
      return new Response(JSON.stringify(await crawlStatus(env)), { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const kvKey = req.method === 'GET' && url.pathname.startsWith('/data/') ? KV_FILES[url.pathname.slice(6)] : null;
    if (kvKey) {
      const body = await env.DATA.get(kvKey);
      if (!body) return new Response('not found', { status: 404, headers: ch });
      return new Response(body, { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
    }
    if (url.pathname === '/data/health.json' && req.method === 'GET') {
      const body = await env.DATA.get('health:file');
      if (!body) return new Response('not found', { status: 404, headers: ch });
      return new Response(body, { headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
    }
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
