/**
 * pulse library: everything except the Worker entry (a Worker may export only its handler; see index.js).
 * pulse: our own first-party visit tracker. Free plan: one Worker plus one D1 database (site-pulse).
 *
 *   GET  /p.js        the browser script (see tracker.js)
 *   POST /e           receives hits and clicks from that script (always answers 204)
 *   GET  /v/summary   aggregates, public (no per-visit data)
 *   GET  /v/live      who is on the sites right now, aggregates, public
 *   GET  /v/feed      recent visits one by one            needs the PULSE_KEY secret as a Bearer token
 *   GET  /v/journey   one tab session: pages and clicks   needs PULSE_KEY
 *   GET  /v/clickmap  every click on one page             needs PULSE_KEY
 *
 * Never stored: IP addresses, user agents, cookies, typed text. The IP is read only to rate-limit, in memory.
 * Rows older than 90 days are deleted by the daily cron.
 */
import { TRACKER } from './tracker.js';

export const SITES = [
  'streamerosai.com', 'yk.streamerosai.com', 'fitrank.streamerosai.com', 'campus.streamerosai.com',
  'spotai.streamerosai.com', 'tools.streamerosai.com', 'solar.streamerosai.com', 'calc.streamerosai.com',
  'images.streamerosai.com', 'math.streamerosai.com', 'exams.streamerosai.com', 'esports.streamerosai.com',
];
export const RETENTION_DAYS = 90;
const ID = /^[a-z0-9]{8,24}$/;
const KINDS = new Set(['link', 'out', 'btn', 'tab', 'input', 'mail', 'tel', 'other']);
const DASH_ORIGIN = /^https:\/\/analytics\.streamerosai\.com$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

// ---- classification (pure, exported for tests) ----

const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|preview|scrape|fetch|curl|wget|python|requests|axios|go-http|java\/|okhttp|libwww|httpclient|node|undici|postman|insomnia|ahrefs|semrush|mj12|bytespider|ccbot|whatsapp\/|slackbot|discordbot|twitterbot|linkedinbot|telegrambot|vkshare/i;
const DC_ORG = /amazon|aws|google (cloud|llc)|microsoft|azure|digitalocean|digital ocean|hetzner|ovh|linode|vultr|choopa|oracle|alibaba|tencent|contabo|leaseweb|scaleway|m247|datacamp|hosting|datacenter|data center|colocation|\bcloud\b|server|vps|dedicated|zenlayer|psychz|quadranet|frantech|buyvm|serverius|clouvider|netcup|hostinger|ionos|godaddy|rackspace|softlayer|ibm cloud|huawei cloud|equinix|gcore|selectel|timeweb|aeza|stark industries|datapacket|cdn77/i;
const DC_ASN = new Set([16509, 14618, 15169, 396982, 8075, 14061, 24940, 16276, 63949, 20473, 31898, 45102, 132203, 51167, 12876, 60781, 28753, 9009, 212238]);

export function uaInfo(ua) {
  ua = String(ua || '');
  const bot = ua.length < 20 || BOT_UA.test(ua);
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  return { bot, device, browser, os };
}

export function isDatacenter(org, asn) {
  return DC_ASN.has(Number(asn)) || DC_ORG.test(String(org || ''));
}

const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|claude\.ai|copilot\.microsoft\.com|you\.com|phind\.com|poe\.com|deepseek\.com|grok\.com|meta\.ai)$/;
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|baidu\.com|yandex\.[a-z.]+|ecosia\.org|search\.brave\.com|startpage\.com|naver\.com|qwant\.com|ask\.com)$/;
const SOCIAL = /(^|\.)(linkedin\.com|lnkd\.in|t\.co|twitter\.com|x\.com|facebook\.com|fb\.com|instagram\.com|reddit\.com|youtube\.com|youtu\.be|whatsapp\.com|wa\.me|telegram\.org|t\.me|discord\.com|discordapp\.com|dev\.to|medium\.com|news\.ycombinator\.com|quora\.com|pinterest\.com|threads\.net|bsky\.app|hashnode\.com|github\.com)$/;
const SOCIAL_NAME = /linkedin|twitter|^x$|facebook|instagram|reddit|whatsapp|telegram|discord|youtube|dev\.?to|medium|hackernews|quora/i;

export function classifyRef(refHost, site, utmSource, utmMedium) {
  let kind;
  if (!refHost) kind = 'direct';
  else if (refHost === site) kind = 'internal';
  else if (SITES.includes(refHost) || /\.streamerosai\.com$/.test(refHost)) kind = 'own';
  else if (AI.test(refHost)) kind = 'ai';
  else if (SEARCH.test(refHost)) kind = 'search';
  else if (SOCIAL.test(refHost)) kind = 'social';
  else kind = 'other';
  if (kind === 'direct' || kind === 'other') {
    if (/email|newsletter/i.test(utmMedium)) kind = 'email';
    else if (/cpc|ppc|paid/i.test(utmMedium)) kind = 'paid';
    else if (kind === 'direct' && utmSource) kind = SOCIAL_NAME.test(utmSource) ? 'social' : 'other';
  }
  return kind;
}

// ---- ingest ----

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '');
const int = (v, lo, hi) => {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
};

/** Validate and normalise one message from the browser script. Returns null when it is not acceptable. */
export function clean(m) {
  if (!m || typeof m !== 'object' || m.v !== 1) return null;
  if (!SITES.includes(m.s) || !ID.test(m.i || '') || !ID.test(m.u || '')) return null;
  const p = str(m.p, 120).split(/[?#]/)[0];
  if (!p.startsWith('/')) return null;
  let refHost = '', refPath = '';
  try {
    if (m.r) {
      const u = new URL(String(m.r));
      refHost = u.hostname.replace(/^www\./, '').slice(0, 80);
      refPath = u.pathname.slice(0, 80);
    }
  } catch { /* an unreadable referrer is treated as none */ }
  const utm = str(m.m, 130).split('|');
  const us = (utm[0] || '').replace(/[^\w .\-]/g, ''), um = (utm[1] || '').replace(/[^\w .\-]/g, ''), uc = (utm[2] || '').replace(/[^\w .\-]/g, '');
  const clicks = (Array.isArray(m.c) ? m.c : []).slice(0, 30).map((c) => ({
    n: int(c && c.n, 1, 1e6), t: int(c && c.t, 0, 864e5),
    k: KINDS.has(c && c.k) ? c.k : 'other', l: str(c && c.l, 40), h: str(c && c.h, 100).split(/[?#]/)[0],
    x: int(c && c.x, 0, 100), y: int(c && c.y, 0, 1e5), g: str(c && c.g, 40), z: c && c.z ? 1 : 0,
  }));
  return {
    site: m.s, id: m.i, sid: m.u, path: p, refHost, refPath, utmSource: us, utmMedium: um, utmCampaign: uc,
    w: int(m.w, 0, 2e4), h: int(m.h, 0, 2e4), lang: str(m.l, 12),
    human: m.hu ? 1 : 0, wd: m.wd ? 1 : 0, active: int(m.a, 0, 14400), scroll: int(m.sc, 0, 100), nclicks: int(m.nc, 0, 1e6), clicks,
  };
}

const UPSERT = `INSERT INTO hits (id,sid,site,path,ts,last,ref_host,ref_path,ref_kind,utm_source,utm_medium,utm_campaign,country,device,browser,os,w,h,lang,org,asn,human,bot,dc,wd,scroll,active,clicks)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET last=excluded.last, human=MAX(hits.human,excluded.human), wd=MAX(hits.wd,excluded.wd),
  scroll=MAX(hits.scroll,excluded.scroll), active=MAX(hits.active,excluded.active), clicks=MAX(hits.clicks,excluded.clicks)
WHERE hits.site=excluded.site AND hits.sid=excluded.sid`;
const CLICK = `INSERT OR IGNORE INTO clicks (hid,n,ts,site,path,kind,label,href,x,y,sec,z)
SELECT ?,?,hits.ts+?,hits.site,hits.path,?,?,?,?,?,?,? FROM hits WHERE hits.id=?`;

const seen = new Map();
function limited(ip) {
  const now = Date.now();
  const e = seen.get(ip);
  if (!e || now - e.t > 60000) {
    if (seen.size > 5000) seen.clear();
    seen.set(ip, { t: now, n: 1 });
    return false;
  }
  return ++e.n > 90;
}

export async function ingest(req, env) {
  const text = await req.text();
  if (text.length > 8000) return;
  if (limited(req.headers.get('CF-Connecting-IP') || 'x')) return;
  let msg;
  try { msg = JSON.parse(text); } catch { return; }
  const c = clean(msg);
  if (!c) return;
  const origin = req.headers.get('Origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    if (host !== c.site) return;
  }
  const cf = req.cf || {};
  const ua = uaInfo(req.headers.get('User-Agent'));
  const org = String(cf.asOrganization || '').slice(0, 60);
  const dc = isDatacenter(org, cf.asn) ? 1 : 0;
  const now = Date.now();
  const kind = classifyRef(c.refHost, c.site, c.utmSource, c.utmMedium);
  const stmts = [
    env.DB.prepare(UPSERT).bind(c.id, c.sid, c.site, c.path, now, now, c.refHost || c.utmSource.toLowerCase(), c.refPath, kind, c.utmSource, c.utmMedium, c.utmCampaign,
      String(cf.country || '').slice(0, 2), ua.device, ua.browser, ua.os, c.w, c.h, c.lang, org, Number(cf.asn) || 0,
      c.human, ua.bot ? 1 : 0, dc, c.wd, c.scroll, c.active, c.nclicks),
    ...c.clicks.map((k) => env.DB.prepare(CLICK).bind(c.id, k.n, k.t, k.k, k.l, k.h, k.x, k.y, k.g, k.z, c.id)),
  ];
  await env.DB.batch(stmts);
}

// ---- reads ----

/** A visit's verdict. "real" means a person acted on the page; "bot" a known robot or an automated browser; the rest is unclear. */
export const STATUS = `(CASE WHEN bot=1 OR wd=1 THEN 'bot' WHEN human=1 THEN 'real' WHEN dc=1 THEN 'bot' ELSE 'unclear' END)`;

const all = async (env, sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const num = (v, d, lo, hi) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const siteOf = (q) => (SITES.includes(q) ? q : '');

export async function summary(env, q) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const who = q.get('who') === 'all' ? '' : ` AND ${STATUS}='real'`;
  const since = Date.now() - days * 864e5;
  const base = `FROM hits WHERE ts>=?${site ? ' AND site=?' : ''}`;
  const a = site ? [since, site] : [since];
  const cbase = `FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=?${site ? ' AND c.site=?' : ''}${who}`;
  const [status, bySite, kinds, hosts, pages, countries, devices, daily, clicks, signals] = await Promise.all([
    all(env, `SELECT ${STATUS} AS status, COUNT(*) AS hits, COUNT(DISTINCT sid) AS sessions, ROUND(AVG(active),1) AS active, ROUND(AVG(scroll)) AS scroll ${base} GROUP BY status`, a),
    all(env, `SELECT site, ${STATUS} AS status, COUNT(*) AS n ${base} GROUP BY site, status`, a),
    all(env, `SELECT ref_kind, COUNT(*) AS n ${base}${who} GROUP BY ref_kind ORDER BY n DESC`, a),
    all(env, `SELECT ref_kind, ref_host, COUNT(*) AS n ${base}${who} AND ref_host!='' GROUP BY ref_kind, ref_host ORDER BY n DESC LIMIT 15`, a),
    all(env, `SELECT site, path, COUNT(*) AS n, ROUND(AVG(active),1) AS active, ROUND(AVG(scroll)) AS scroll ${base}${who} GROUP BY site, path ORDER BY n DESC LIMIT 20`, a),
    all(env, `SELECT country, COUNT(*) AS n ${base}${who} AND country!='' GROUP BY country ORDER BY n DESC LIMIT 12`, a),
    all(env, `SELECT device, browser, COUNT(*) AS n ${base}${who} GROUP BY device, browser ORDER BY n DESC LIMIT 12`, a),
    all(env, `SELECT date(ts/1000,'unixepoch') AS day, ${STATUS} AS status, COUNT(*) AS n ${base} GROUP BY day, status ORDER BY day`, a),
    all(env, `SELECT c.site, c.kind, c.label, c.href, COUNT(*) AS n, SUM(c.z) AS rage ${cbase} AND c.kind!='other' GROUP BY c.site, c.kind, c.label, c.href ORDER BY n DESC LIMIT 25`, a),
    all(env, `SELECT SUM(CASE WHEN c.kind='other' THEN 1 ELSE 0 END) AS dead, SUM(c.z) AS rage, COUNT(*) AS total ${cbase}`, a),
  ]);
  return { generatedAt: new Date().toISOString(), days, site: site || 'all', who: who ? 'real' : 'all', status, bySite, kinds, hosts, pages, countries, devices, daily, clicks, signals: signals[0] || {} };
}

export async function live(env, q) {
  const site = siteOf(q.get('site'));
  const since = Date.now() - 40000;
  const base = `FROM hits WHERE last>=?${site ? ' AND site=?' : ''}`;
  const a = site ? [since, site] : [since];
  const [status, bySite, pages] = await Promise.all([
    all(env, `SELECT ${STATUS} AS status, COUNT(*) AS n ${base} GROUP BY status`, a),
    all(env, `SELECT site, ${STATUS} AS status, COUNT(*) AS n ${base} GROUP BY site, status`, a),
    all(env, `SELECT site, path, COUNT(*) AS n ${base} AND ${STATUS}='real' GROUP BY site, path ORDER BY n DESC LIMIT 10`, a),
  ]);
  return { generatedAt: new Date().toISOString(), windowSeconds: 40, status, bySite, pages };
}

export async function feed(env, q) {
  const site = siteOf(q.get('site'));
  const limit = num(q.get('limit'), 60, 1, 200);
  const who = q.get('who');
  const where = [site ? 'site=?' : '', ['real', 'bot', 'unclear'].includes(who) ? `${STATUS}='${who}'` : ''].filter(Boolean);
  return all(env, `SELECT id, sid, site, path, ts, last, ref_host, ref_kind, country, device, browser, os, org, w, h, active, scroll, clicks AS nclicks, ${STATUS} AS status FROM hits ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last DESC LIMIT ?`, [...(site ? [site] : []), limit]);
}

export async function journey(env, q) {
  const sid = q.get('sid') || '';
  if (!ID.test(sid)) return { hits: [], clicks: [] };
  const [hits, clicks] = await Promise.all([
    all(env, `SELECT id, site, path, ts, last, ref_host, ref_kind, country, device, browser, os, active, scroll, ${STATUS} AS status FROM hits WHERE sid=? ORDER BY ts LIMIT 60`, [sid]),
    all(env, `SELECT hid, n, ts, kind, label, href, x, y, sec, z FROM clicks WHERE hid IN (SELECT id FROM hits WHERE sid=?) ORDER BY ts LIMIT 400`, [sid]),
  ]);
  return { hits, clicks };
}

export async function clickmap(env, q) {
  const site = siteOf(q.get('site'));
  const path = String(q.get('path') || '').slice(0, 120);
  if (!site || !path.startsWith('/')) return { visits: 0, clicks: [] };
  const since = Date.now() - num(q.get('days'), 28, 1, 90) * 864e5;
  const [v, clicks] = await Promise.all([
    all(env, `SELECT COUNT(*) AS n FROM hits WHERE site=? AND path=? AND ts>=? AND ${STATUS}='real'`, [site, path, since]),
    all(env, `SELECT kind, label, x, y, z FROM clicks WHERE site=? AND path=? AND ts>=? ORDER BY ts DESC LIMIT 600`, [site, path, since]),
  ]);
  return { visits: (v[0] && v[0].n) || 0, clicks };
}

// ---- http ----

export function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { Vary: 'Origin' };
  if (DASH_ORIGIN.test(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export function authorised(req, env) {
  const key = env.PULSE_KEY;
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!key || got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export const json = (body, ch, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': cache } });
