// Pulls Google Analytics 4 and Search Console data for every site and writes site/data.json, which
// site/index.html reads. The data is aggregate numbers only and is published as-is (the repo is public).
// No dependencies: Node 20+ (fetch, crypto). Secret: GA_SERVICE_ACCOUNT_JSON.
import crypto from 'node:crypto';
import fs from 'node:fs';

const PROPERTY = process.env.GA_PROPERTY_ID || '562159345';
const DAYS = 28;
const GSC_SITES = [
  'sc-domain:streamerosai.com',
  'https://yk.streamerosai.com/',
  'https://fitrank.streamerosai.com/',
  'https://campus.streamerosai.com/',
  'https://spotai.streamerosai.com/',
  'https://streamerosai.com/',
];
const KEY_EVENTS = ['whatsapp_click', 'email_click', 'phone_click', 'generate_lead', 'app_download', 'template_download', 'agreement_signed', 'calculator_use'];

const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('GA_SERVICE_ACCOUNT_JSON must be set as a repository secret.');
  process.exit(1);
}
const sa = JSON.parse(raw);

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
const errors = [];

async function ga(name, { dims = [], mets, limit = 250, filter, order, range = 'cur' }) {
  const ranges = {
    cur: { startDate: `${DAYS}daysAgo`, endDate: 'today' },
    prev: { startDate: `${DAYS * 2}daysAgo`, endDate: `${DAYS + 1}daysAgo` },
  };
  const body = {
    dateRanges: [ranges[range]],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    limit,
    keepEmptyRows: false,
  };
  if (filter) body.dimensionFilter = filter;
  if (order) body.orderBys = order;
  else if (mets.length) body.orderBys = [{ metric: { metricName: mets[0] }, desc: true }];
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) {
    errors.push(`${name}: ${j.error?.message ?? res.status}`);
    return { dims, mets, rows: [] };
  }
  const rows = (j.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]);
  return { dims, mets, rows };
}

const inList = (field, values) => ({ filter: { fieldName: field, inListFilter: { values } } });
const keyEventFilter = inList('eventName', KEY_EVENTS);
const byDate = [{ dimension: { dimensionName: 'date' } }];

const reports = {};
const M = ['sessions', 'activeUsers', 'keyEvents'];
const plan = {
  totals: { dims: ['hostName'], mets: ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'eventCount', 'keyEvents', 'userEngagementDuration'] },
  totalsPrev: { dims: ['hostName'], mets: ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'eventCount', 'keyEvents', 'userEngagementDuration'], range: 'prev' },
  daily: { dims: ['date', 'hostName'], mets: ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'], limit: 1000, order: byDate },
  channels: { dims: ['hostName', 'sessionDefaultChannelGroup'], mets: [...M, 'engagedSessions'] },
  sourceMedium: { dims: ['hostName', 'sessionSourceMedium'], mets: [...M, 'engagedSessions'], limit: 400 },
  campaigns: { dims: ['hostName', 'sessionCampaignName', 'sessionSourceMedium'], mets: [...M, 'engagedSessions'], limit: 300 },
  campaignContent: { dims: ['hostName', 'sessionManualAdContent', 'sessionManualTerm'], mets: ['sessions', 'keyEvents'], limit: 200 },
  firstTouch: { dims: ['hostName', 'firstUserSourceMedium', 'firstUserCampaignName'], mets: ['newUsers', 'sessions', 'keyEvents'], limit: 300 },
  referrers: { dims: ['hostName', 'pageReferrer'], mets: ['screenPageViews', 'activeUsers'], limit: 300 },
  landing: { dims: ['hostName', 'landingPage'], mets: ['sessions', 'engagedSessions', 'keyEvents', 'activeUsers'], limit: 400 },
  landingSource: { dims: ['hostName', 'landingPage', 'sessionSourceMedium'], mets: ['sessions', 'keyEvents'], limit: 500 },
  pages: { dims: ['hostName', 'pagePath'], mets: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'keyEvents'], limit: 500 },
  countries: { dims: ['hostName', 'country'], mets: ['sessions', 'activeUsers', 'keyEvents'], limit: 400 },
  cities: { dims: ['hostName', 'country', 'city'], mets: ['sessions', 'keyEvents'], limit: 300 },
  devices: { dims: ['hostName', 'deviceCategory'], mets: ['sessions', 'keyEvents'] },
  browsers: { dims: ['hostName', 'browser'], mets: ['sessions', 'keyEvents'], limit: 100 },
  os: { dims: ['hostName', 'operatingSystem'], mets: ['sessions', 'keyEvents'], limit: 100 },
  languages: { dims: ['hostName', 'language'], mets: ['sessions', 'keyEvents'], limit: 100 },
  newReturning: { dims: ['hostName', 'newVsReturning'], mets: ['sessions', 'activeUsers', 'keyEvents'] },
  weekday: { dims: ['hostName', 'dayOfWeek'], mets: ['sessions', 'keyEvents'], limit: 100, order: [{ dimension: { dimensionName: 'dayOfWeek' } }] },
  hour: { dims: ['hostName', 'hour'], mets: ['sessions', 'keyEvents'], limit: 400, order: [{ dimension: { dimensionName: 'hour' } }] },
  events: { dims: ['hostName', 'eventName'], mets: ['eventCount', 'totalUsers', 'keyEvents'], limit: 500 },
  keyEventsDaily: { dims: ['date', 'hostName', 'eventName'], mets: ['eventCount'], limit: 2000, filter: keyEventFilter, order: byDate },
  keyEventsBySource: { dims: ['hostName', 'eventName', 'sessionSourceMedium'], mets: ['eventCount'], limit: 500, filter: keyEventFilter },
  keyEventsByPage: { dims: ['hostName', 'eventName', 'pagePath'], mets: ['eventCount'], limit: 600, filter: keyEventFilter },
  ctaText: { dims: ['hostName', 'eventName', 'customEvent:cta_text'], mets: ['eventCount'], limit: 500, filter: keyEventFilter },
  forms: { dims: ['hostName', 'eventName', 'customEvent:form_name'], mets: ['eventCount'], limit: 200, filter: inList('eventName', ['generate_lead', 'agreement_signed']) },
  leadsFirstTouch: {
    dims: ['hostName', 'customEvent:first_source', 'customEvent:first_medium', 'customEvent:first_campaign', 'customEvent:form_name'],
    mets: ['eventCount'],
    limit: 400,
    filter: inList('eventName', ['generate_lead', 'agreement_signed']),
  },
  eventsFirstTouch: {
    dims: ['hostName', 'eventName', 'customEvent:first_source', 'customEvent:first_medium'],
    mets: ['eventCount'],
    limit: 500,
    filter: keyEventFilter,
  },
};
for (const [name, spec] of Object.entries(plan)) reports[name] = await ga(name, spec);

// Realtime (last 30 minutes).
async function realtime(dims, mets) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runRealtimeReport`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ dimensions: dims.map((name) => ({ name })), metrics: mets.map((name) => ({ name })), limit: 50 }),
  });
  const j = await res.json();
  if (!res.ok) {
    errors.push(`realtime: ${j.error?.message ?? res.status}`);
    return { dims, mets, rows: [] };
  }
  return { dims, mets, rows: (j.rows ?? []).map((r) => [...r.dimensionValues.map((v) => v.value), ...r.metricValues.map((v) => Number(v.value))]) };
}
reports.rtStreams = await realtime(['streamName'], ['activeUsers', 'screenPageViews', 'eventCount']);
reports.rtPages = await realtime(['streamName', 'unifiedScreenName'], ['activeUsers']);
reports.rtCountries = await realtime(['country'], ['activeUsers']);

// Search Console, for every property the service account can read.
const iso = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 2 * 864e5); // Search Console data lags about two days
const start = new Date(end.getTime() - (DAYS - 1) * 864e5);
async function gsc(site, dimensions, rowLimit) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions, rowLimit }),
  });
  if (!res.ok) return { status: res.status, rows: [] };
  const j = await res.json();
  return { status: 200, rows: (j.rows ?? []).map((r) => [...(r.keys ?? []), r.clicks, r.impressions, +(r.ctr * 100).toFixed(2), +r.position.toFixed(1)]) };
}
const search = {};
for (const site of GSC_SITES) {
  const total = await gsc(site, [], 1);
  if (total.status !== 200) {
    search[site] = { ok: false, status: total.status };
    continue;
  }
  search[site] = {
    ok: true,
    total: total.rows[0] ?? null,
    queries: (await gsc(site, ['query'], 100)).rows,
    pages: (await gsc(site, ['page'], 100)).rows,
    daily: (await gsc(site, ['date'], 60)).rows,
    countries: (await gsc(site, ['country'], 20)).rows,
    devices: (await gsc(site, ['device'], 5)).rows,
    queryPage: (await gsc(site, ['query', 'page'], 150)).rows,
  };
}

const payload = { generatedAt: new Date().toISOString(), days: DAYS, property: PROPERTY, keyEvents: KEY_EVENTS, reports, search, errors };
if (errors.length) console.warn(`Warnings (${errors.length}):\n${errors.join('\n')}`);

fs.mkdirSync('site', { recursive: true });
fs.writeFileSync('site/data.json', JSON.stringify(payload));
const gscOk = Object.values(search).filter((s) => s.ok).length;
console.log(`Wrote site/data.json: ${Object.keys(reports).length} GA4 reports, ${gscOk}/${GSC_SITES.length} Search Console properties, ${errors.length} warnings.`);
