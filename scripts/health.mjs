// Index health: for every URL in each site's live sitemap, ask Google's URL Inspection API whether the page is indexed
// and why not. Slow (one call per page), so it runs once a day in its own workflow and commits data/health.json;
// scripts/build.mjs publishes that file with every dashboard rebuild.
import crypto from 'node:crypto';
import fs from 'node:fs';

const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('GA_SERVICE_ACCOUNT_JSON must be set.'); process.exit(1); }
const sa = JSON.parse(raw);
const b64u = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}
const auth = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' };

async function pool(tasks, limit) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

const SITE_PROPS = {
  'yk.streamerosai.com': 'https://yk.streamerosai.com/',
  'campus.streamerosai.com': 'https://campus.streamerosai.com/',
  'streamerosai.com': 'https://streamerosai.com/',
  'fitrank.streamerosai.com': 'https://fitrank.streamerosai.com/',
  'spotai.streamerosai.com': 'https://spotai.streamerosai.com/',
};

async function sitemapUrls(host) {
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

async function inspectUrl(siteUrl, inspectionUrl) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', headers: auth, body: JSON.stringify({ inspectionUrl, siteUrl }) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) return { u: inspectionUrl, s: `Could not inspect (${res.status})`, v: 'ERROR', c: null };
    const r = (await res.json()).inspectionResult?.indexStatusResult ?? {};
    return { u: inspectionUrl, s: r.coverageState || 'Unknown', v: r.verdict || 'UNKNOWN', c: r.lastCrawlTime ? r.lastCrawlTime.slice(0, 10) : null };
  }
  return { u: inspectionUrl, s: 'Could not inspect (busy)', v: 'ERROR', c: null };
}

const index = {};
for (const [host, property] of Object.entries(SITE_PROPS)) {
  const urls = await sitemapUrls(host);
  const rows = await pool(urls.map((u) => () => inspectUrl(property, u)), 6);
  const byState = {};
  rows.forEach((r) => (byState[r.s] = (byState[r.s] || 0) + 1));
  const indexed = rows.filter((r) => r.v === 'PASS').length;
  index[host] = { property, inspected: rows.length, indexed, notIndexed: rows.length - indexed, byState, urls: rows.filter((r) => r.v !== 'PASS').map((r) => [r.u, r.s, r.c]).slice(0, 150) };
  console.log(`${host}: ${indexed}/${rows.length} indexed`);
}
fs.mkdirSync('data', { recursive: true });
const now = new Date().toISOString();
fs.writeFileSync('data/health.json', JSON.stringify({ generatedAt: now, indexAt: now, index }, null, 1));
console.log('Wrote data/health.json');
