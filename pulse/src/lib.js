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
 *   GET  /v/insights  wins, sources, landing pages, paths, funnel, hours, broken pages, speed, alerts. Public aggregates.
 *   GET  /v/goals     goals per site: WhatsApp, email, phone, form sent, download, app store, product site, GitHub. Public aggregates.
 *   POST /v/mine      mark one visit (and the same visitor that day) as the owner's own, or undo it. Needs PULSE_KEY
 *   GET  /me          walks the owner's browser through every site once so each one remembers "this is my device"
 *
 * Counting: one row is one page view. A visit is one browser tab (sid). A person is one visitor on one day (vid),
 * so the same person on two days counts twice, and two tabs on the same day count once.
 * Days and hours are in Indian time. Visits from the owner's marked devices (me=1) are left out of every number.
 *
 * Never stored: IP addresses, user agents, cookies, typed text. The IP is read in memory only, to rate-limit and to
 * make the day's visitor code: SHA-256 of a random daily salt + address + browser name. The salt is deleted the next
 * day, so the code cannot be turned back into an address or linked across days.
 * Rows older than 90 days are deleted by the daily cron.
 */
import { devMode } from './dev.js';
import { TRACKER } from './tracker.js';

export const SITES = [
  'streamerosai.com', 'yk.streamerosai.com', 'fitrank.streamerosai.com', 'campus.streamerosai.com',
  'spotai.streamerosai.com', 'tools.streamerosai.com', 'solar.streamerosai.com', 'calc.streamerosai.com',
  'images.streamerosai.com', 'math.streamerosai.com', 'exams.streamerosai.com', 'esports.streamerosai.com',
  'sable.streamerosai.com',
];
export const RETENTION_DAYS = 90;
const ID = /^[a-z0-9]{8,24}$/;
const KINDS = new Set(['link', 'out', 'btn', 'tab', 'input', 'mail', 'tel', 'dl', 'goal', 'fab', 'other']);
const DASH_ORIGIN = /^https:\/\/analytics\.streamerosai\.com$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

// ---- classification (pure, exported for tests) ----

const BOT_UA = /(?<!cu)bot|crawl|spider|slurp|headless|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|preview|scrape|fetch|curl|wget|python|requests|axios|go-http|java\/|okhttp|libwww|httpclient|node|undici|postman|insomnia|ahrefs|semrush|mj12|bytespider|ccbot|whatsapp\/|slackbot|discordbot|twitterbot|linkedinbot|telegrambot|vkshare/i;
const DC_ORG = /amazon|aws|google (cloud|llc)|microsoft|azure|digitalocean|digital ocean|hetzner|ovh|linode|vultr|choopa|oracle|alibaba|tencent|contabo|leaseweb|scaleway|m247|datacamp|hosting|datacenter|data center|colocation|\bcloud\b|server|vps|dedicated|zenlayer|psychz|quadranet|frantech|buyvm|serverius|clouvider|netcup|hostinger|ionos|godaddy|rackspace|softlayer|ibm cloud|huawei cloud|equinix|gcore|selectel|timeweb|aeza|stark industries|datapacket|cdn77|hostroyale|ultahost|logicweb|ipnetzone|ip pools|proxy|palo alto networks|internet archive|meta platforms/i;
// 24 Nov 2026: added hosting, proxy and crawler networks seen in the last 30 days with no human action (HostRoyale, UltaHost,
// LogicWeb, IPNetZone, IP pools, Palo Alto Networks scanners, the Internet Archive, Meta's link-preview crawler). A visit with a real
// tap, key or scroll is still counted as a person whatever its network (see STATUS).
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
    human: m.hu ? 1 : 0, wd: m.wd ? 1 : 0, me: m.me ? 1 : 0, active: int(m.a, 0, 14400), seen: int(m.vs, 0, 14400), scroll: int(m.sc, 0, 100), nclicks: int(m.nc, 0, 1e6), err: int(m.er, 0, 20), st: int(m.st, 0, 999), lcp: int(m.lc, 0, 6e4), clicks,
    tr: m.tr ? 1 : 0, tl: str(m.tl, 12), net: /^(slow-2g|2g|3g|4g)$/.test(String(m.nt || '')) ? String(m.nt) : '', inp: int(m.ip, 0, 6e4), cls: int(m.cl, 0, 1e5),
    errs: (Array.isArray(m.em) ? m.em : []).slice(0, 3).map((x) => str(x, 160).replace(/https?:\/\/\S+/g, (u) => u.split(/[?#]/)[0])).filter(Boolean),
  };
}

const UPSERT = `INSERT INTO hits (id,sid,site,path,ts,last,ref_host,ref_path,ref_kind,utm_source,utm_medium,utm_campaign,country,device,browser,os,w,h,lang,org,asn,human,bot,dc,wd,scroll,active,clicks,st,lcp,err,vid,me,seen,tr,tl,net,inp,cls)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT x.vid FROM hits x WHERE x.sid=? AND x.vid!='' ORDER BY x.ts LIMIT 1),?),?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET last=excluded.last, human=MAX(hits.human,excluded.human), wd=MAX(hits.wd,excluded.wd),
  scroll=MAX(hits.scroll,excluded.scroll), active=MAX(hits.active,excluded.active), clicks=MAX(hits.clicks,excluded.clicks),
  st=MAX(hits.st,excluded.st), lcp=MAX(hits.lcp,excluded.lcp), err=MAX(hits.err,excluded.err),
  me=MAX(hits.me,excluded.me), seen=MAX(hits.seen,excluded.seen), tr=MAX(hits.tr,excluded.tr),
  tl=CASE WHEN excluded.tl!='' THEN excluded.tl ELSE hits.tl END, net=CASE WHEN excluded.net!='' THEN excluded.net ELSE hits.net END,
  inp=MAX(hits.inp,excluded.inp), cls=MAX(hits.cls,excluded.cls)
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

/** Seconds Indian time is ahead of UTC. Days and hours in every report use it. */
export const IST = 19800;
export const istDay = (ms) => new Date(ms + IST * 1000).toISOString().slice(0, 10);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

let saltCache = { day: '', salt: '' };
/** The random salt for one Indian day: made on first use, kept in the database for that day, deleted by the cron after it. */
async function dailySalt(env, day) {
  if (saltCache.day === day) return saltCache.salt;
  const fresh = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)').bind(day, fresh)]);
  const rows = (await env.DB.prepare('SELECT salt FROM salts WHERE day=?').bind(day).all()).results || [];
  saltCache = { day, salt: (rows[0] && rows[0].salt) || fresh };
  return saltCache.salt;
}
/** "The same visitor today": a one-way code. Neither the address nor the browser name is stored anywhere. */
export async function visitorId(salt, ip, ua) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip + '|' + ua));
  return hex(new Uint8Array(buf)).slice(0, 16);
}

export async function ingest(req, env) {
  const text = await req.text();
  if (text.length > 8000) return;
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (limited(ip || 'x')) return;
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
  const vid = ip ? await visitorId(await dailySalt(env, istDay(now)), ip, req.headers.get('User-Agent') || '') : '';
  const stmts = [
    env.DB.prepare(UPSERT).bind(c.id, c.sid, c.site, c.path, now, now, c.refHost || c.utmSource.toLowerCase(), c.refPath, kind, c.utmSource, c.utmMedium, c.utmCampaign,
      String(cf.country || '').slice(0, 2), ua.device, ua.browser, ua.os, c.w, c.h, c.lang, org, Number(cf.asn) || 0,
      c.human, ua.bot ? 1 : 0, dc, c.wd, c.scroll, c.active, c.nclicks, c.st, c.lcp, c.err, c.sid, vid, c.me, c.seen, c.tr, c.tl, c.net, c.inp, c.cls),
    // a marked device also claims what the same visitor did earlier today, before the mark reached this site
    ...(c.me ? [env.DB.prepare(`UPDATE hits SET me=1 WHERE me=0 AND (sid=? OR (vid!='' AND vid=?))`).bind(c.sid, vid)] : []),
    ...c.clicks.map((k) => env.DB.prepare(CLICK).bind(c.id, k.n, k.t, k.k, k.l, k.h, k.x, k.y, k.g, k.z, c.id)),
    ...c.errs.map((m) => env.DB.prepare('INSERT INTO errs (hid,ts,site,path,msg,tr) VALUES (?,?,?,?,?,?)').bind(c.id, now, c.site, c.path, m, c.tr)),
  ];
  await env.DB.batch(stmts);
}

// ---- reads ----

/** A visit's verdict, strongest evidence first. An automated browser is a bot. After that a real touch, key or scroll wins,
    so a person is never called a bot only because of a word in the browser name or the network they are on.
    With no human action, a robot browser name or a hosting network is a bot; the rest is unclear. */
export const STATUS = `(CASE WHEN wd=1 THEN 'bot' WHEN human=1 THEN 'real' WHEN bot=1 OR dc=1 THEN 'bot' ELSE 'unclear' END)`;
/** A person: every visit without evidence of a bot. 'real' acted (tapped, scrolled, typed); 'unclear' is a person who did not
    interact (left quickly or never touched the page). No interaction is not evidence of a bot, so both count as people
    (owner's decision, 24 Nov 2026), and reports show how many of them interacted. */
export const PERSON = `${STATUS}!='bot'`;
/** Seconds a page was on screen. Rows from before 18 Nov 2026 have no count, so the gap between first and last message stands in. */
const ON_SCREEN = `MAX(seen,(last-ts)/1000)`;
/** Why a visit got its verdict: auto (automated browser), acted (human action), ua (says it is a robot), host (hosting network, no action),
    and for visits where nothing happened: left (gone within 2 seconds) or stayed (page stayed open, never touched). */
export const WHY = `(CASE WHEN wd=1 THEN 'auto' WHEN human=1 THEN 'acted' WHEN bot=1 THEN 'ua' WHEN dc=1 THEN 'host' WHEN ${ON_SCREEN}>=3 THEN 'stayed' ELSE 'left' END)`;
/** One person on one day: the day's visitor code, or the tab id for rows from before the code existed. */
export const PK = `(CASE WHEN vid!='' THEN vid ELSE sid END)`;
/** The same two verdicts for a group of page views (one visit, or one person). */
const AGG_STATUS = `(CASE WHEN MAX(wd)=1 THEN 'bot' WHEN MAX(human)=1 THEN 'real' WHEN MAX(bot)=1 OR MAX(dc)=1 THEN 'bot' ELSE 'unclear' END)`;
const AGG_WHY = `(CASE WHEN MAX(wd)=1 THEN 'auto' WHEN MAX(human)=1 THEN 'acted' WHEN MAX(bot)=1 THEN 'ua' WHEN MAX(dc)=1 THEN 'host' WHEN MAX(${ON_SCREEN})>=3 THEN 'stayed' ELSE 'left' END)`;
/** The Indian calendar day of a page view. */
const DAY = `date(ts/1000+${IST},'unixepoch')`;
/** Search Console counts its days in Pacific time, so the cross-check has to as well. */
export function pacificOffset(ms) {
  try { return /PDT/.test(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' }).format(new Date(ms))) ? -25200 : -28800; } catch { return -28800; }
}

const all = async (env, sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const num = (v, d, lo, hi) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const siteOf = (q) => (SITES.includes(q) ? q : '');

export async function summary(env, q) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const who = q.get('who') === 'all' ? '' : ` AND ${PERSON}`;
  const since = Date.now() - days * 864e5;
  const base = `FROM hits WHERE ts>=? AND me=0${site ? ' AND site=?' : ''}`;
  const a = site ? [since, site] : [since];
  const cbase = `FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=? AND hits.me=0${site ? ' AND c.site=?' : ''}${who}`;
  const [status, bySite, kinds, hosts, pages, countries, devices, daily, clicks, signals, actions, bots, idle, mine] = await Promise.all([
    // people = visitors per day, sessions = visits (tabs), hits = pages opened
    all(env, `SELECT status, COUNT(*) AS people, SUM(visits) AS sessions, SUM(hits) AS hits, ROUND(SUM(active)*1.0/SUM(hits),1) AS active, ROUND(SUM(scroll)*1.0/SUM(hits)) AS scroll FROM (SELECT ${PK} AS pk, ${AGG_STATUS} AS status, COUNT(DISTINCT sid) AS visits, COUNT(*) AS hits, SUM(active) AS active, SUM(scroll) AS scroll ${base} GROUP BY pk) GROUP BY status`, a),
    all(env, `SELECT site, status, COUNT(*) AS n FROM (SELECT site, ${PK} AS pk, ${AGG_STATUS} AS status ${base} GROUP BY site, pk) GROUP BY site, status`, a),
    all(env, `SELECT ref_kind, COUNT(*) AS n ${base}${who} GROUP BY ref_kind ORDER BY n DESC`, a),
    all(env, `SELECT ref_kind, ref_host, COUNT(*) AS n ${base}${who} AND ref_host!='' GROUP BY ref_kind, ref_host ORDER BY n DESC LIMIT 15`, a),
    all(env, `SELECT site, path, COUNT(*) AS n, ROUND(AVG(active),1) AS active, ROUND(AVG(scroll)) AS scroll ${base}${who} GROUP BY site, path ORDER BY n DESC LIMIT 20`, a),
    all(env, `SELECT country, COUNT(DISTINCT ${PK}) AS n ${base}${who} AND country!='' GROUP BY country ORDER BY n DESC LIMIT 12`, a),
    all(env, `SELECT device, browser, COUNT(DISTINCT ${PK}) AS n ${base}${who} GROUP BY device, browser ORDER BY n DESC LIMIT 12`, a),
    all(env, `SELECT day, status, COUNT(*) AS n FROM (SELECT ${DAY} AS day, ${PK} AS pk, ${AGG_STATUS} AS status ${base} GROUP BY day, pk) GROUP BY day, status ORDER BY day`, a),
    all(env, `SELECT c.site, c.kind, c.label, c.href, COUNT(*) AS n, SUM(c.z) AS rage ${cbase} AND c.kind NOT IN ('other','fab') GROUP BY c.site, c.kind, c.label, c.href ORDER BY n DESC LIMIT 25`, a),
    all(env, `SELECT SUM(CASE WHEN c.kind='other' THEN 1 ELSE 0 END) AS dead, SUM(c.z) AS rage, COUNT(*) AS total ${cbase}`, a),
    all(env, `SELECT c.site, c.path, c.kind, c.label, c.href, COUNT(*) AS n, MAX(c.ts) AS last ${cbase} AND c.kind IN ('dl','out','mail','tel','goal') GROUP BY c.site, c.path, c.kind, c.label, c.href ORDER BY last DESC LIMIT 40`, a),
    all(env, `SELECT org, ${WHY} AS why, COUNT(*) AS n, MAX(active) AS active, SUM(clicks) AS clicks ${base} AND ${STATUS}='bot' GROUP BY org, why ORDER BY n DESC LIMIT 12`, a),
    all(env, `SELECT why, COUNT(*) AS n FROM (SELECT ${PK} AS pk, ${AGG_STATUS} AS status, ${AGG_WHY} AS why ${base} GROUP BY pk) WHERE status='unclear' GROUP BY why`, a),
    all(env, `SELECT COUNT(DISTINCT ${PK}) AS people, COUNT(DISTINCT sid) AS visits, COUNT(*) AS hits FROM hits WHERE ts>=? AND me=1${site ? ' AND site=?' : ''}`, a),
  ]);
  const idleOf = (w) => (idle.find((r) => r.why === w) || {}).n || 0;
  return {
    generatedAt: new Date().toISOString(), days, site: site || 'all', who: who ? 'real' : 'all', status, bySite, kinds, hosts, pages, countries, devices, daily, clicks, signals: signals[0] || {}, actions, bots,
    idle: { left: idleOf('left'), stayed: idleOf('stayed') }, mine: mine[0] || { people: 0, visits: 0, hits: 0 },
  };
}

export async function live(env, q) {
  const site = siteOf(q.get('site'));
  const since = Date.now() - 40000;
  const base = `FROM hits WHERE last>=? AND me=0${site ? ' AND site=?' : ''}`;
  const a = site ? [since, site] : [since];
  const [status, bySite, pages] = await Promise.all([
    all(env, `SELECT ${STATUS} AS status, COUNT(DISTINCT ${PK}) AS n ${base} GROUP BY status`, a),
    all(env, `SELECT site, ${STATUS} AS status, COUNT(DISTINCT ${PK}) AS n ${base} GROUP BY site, status`, a),
    all(env, `SELECT site, path, COUNT(DISTINCT ${PK}) AS n ${base} AND ${PERSON} GROUP BY site, path ORDER BY n DESC LIMIT 10`, a),
  ]);
  return { generatedAt: new Date().toISOString(), windowSeconds: 40, status, bySite, pages };
}

/** One line per visit (one browser tab): the page it started on, how many pages it opened, and the verdict for the whole visit.
    who = real | unclear | bot | people (everyone but bots) | me (the owner's marked visits, which every other choice leaves out). */
export async function feed(env, q) {
  const site = siteOf(q.get('site'));
  const limit = num(q.get('limit'), 60, 1, 200);
  const who = q.get('who');
  const having = [who === 'me' ? 'MAX(me)=1' : 'MAX(me)=0', ['real', 'bot', 'unclear'].includes(who) ? `${AGG_STATUS}='${who}'` : who === 'people' ? `${AGG_STATUS}!='bot'` : ''].filter(Boolean);
  const taps = (kinds) => `(SELECT COUNT(*) FROM clicks c JOIN hits x ON x.id=c.hid WHERE x.sid=g.sid AND c.kind IN (${kinds}))`;
  return all(env, `SELECT e.id, e.sid, e.site, e.path, e.ts, g.last, e.ref_host, e.ref_kind, e.country, e.device, e.browser, e.os, e.org, e.w, e.h,
    g.pages, g.active, g.seen, g.scroll, g.nclicks, ${taps("'dl'")} AS ndl, ${taps("'out','mail','tel'")} AS nout, g.status, g.why, g.me
    FROM (SELECT sid, MIN(ts) AS t0, MAX(last) AS last, COUNT(*) AS pages, SUM(active) AS active, SUM(${ON_SCREEN}) AS seen, MAX(scroll) AS scroll, SUM(clicks) AS nclicks, MAX(me) AS me, ${AGG_STATUS} AS status, ${AGG_WHY} AS why
      FROM hits ${site ? 'WHERE site=?' : ''} GROUP BY sid HAVING ${having.join(' AND ')} ORDER BY last DESC LIMIT ?) g
    JOIN hits e ON e.sid=g.sid AND e.ts=g.t0 GROUP BY g.sid ORDER BY g.last DESC`, [...(site ? [site] : []), limit]);
}

/** The owner says "this visit was me" (or takes it back). The same visitor's other visits that day follow. */
export async function markMine(env, body) {
  const sid = String((body && body.sid) || '');
  if (!ID.test(sid)) return { ok: false };
  const me = body.me === false || body.me === 0 ? 0 : 1;
  await env.DB.batch([env.DB.prepare(`UPDATE hits SET me=? WHERE sid=? OR (vid!='' AND vid IN (SELECT vid FROM hits WHERE sid=?))`).bind(me, sid, sid)]);
  return { ok: true, sid, me };
}

/** Where step N of the "this is my device" walk goes: each site in turn (the script there saves the flag and comes back), then the dashboard. */
export function meStep(q) {
  const v = q.get('v') === 'off' ? 'off' : 'on';
  const step = num(q.get('step'), 0, 0, 99);
  return step < SITES.length ? `https://${SITES[step]}/#pulse-me=${v}-${step}` : `https://analytics.streamerosai.com/watch/?me=${v}`;
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
    all(env, `SELECT COUNT(*) AS n FROM hits WHERE site=? AND path=? AND ts>=? AND me=0 AND ${PERSON}`, [site, path, since]),
    all(env, `SELECT kind, label, x, y, z FROM clicks WHERE site=? AND path=? AND ts>=? AND hid NOT IN (SELECT id FROM hits WHERE me=1) ORDER BY ts DESC LIMIT 600`, [site, path, since]),
  ]);
  return { visits: (v[0] && v[0].n) || 0, clicks };
}

// ---- http ----

export function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { Vary: 'Origin' };
  if (DASH_ORIGIN.test(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export function authorised(req, env) {
  if (devMode(req, env)) return true; // local dev only, see dev.js
  const key = env.PULSE_KEY;
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!key || got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export const json = (body, ch, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': cache } });

// ---- insights: what people did, which sources and pages lead to it, what is broken ----

/** Every action counts: any tap on a link, button, tab, form field, download, email, phone or goal. Taps on nothing do not. */
/** A form started and left unsent ('fab') is a sign of trouble, not a win. */
export const WIN = `(c.kind NOT IN ('other','fab'))`;
/** The moments worth an alert on their own: a file, a contact, WhatsApp, or a goal a page named. */
export const KEY_WIN = `(c.kind IN ('dl','mail','tel','goal') OR (c.kind='out' AND (c.href LIKE 'wa.me%' OR c.href LIKE '%whatsapp%')))`;
const HAS_WIN = `EXISTS (SELECT 1 FROM clicks c WHERE c.hid=hits.id AND ${WIN})`;

/** A React recoverable hydration error, as the minified message names it. */
export const HYDRATION = `(msg LIKE '%React error #418%' OR msg LIKE '%React error #423%' OR msg LIKE '%React error #425%' OR msg LIKE '%Hydration failed%' OR msg LIKE '%did not match%')`;

export async function insights(env, q) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const now = Date.now();
  const since = now - days * 864e5;
  const prevSince = since - days * 864e5;
  const sq = ` AND me=0${site ? ' AND site=?' : ''}`; // the owner's own visits are out of every number
  const sa = site ? [site] : [];
  const real = PERSON; // people: everyone without bot evidence
  const notBot = `${STATUS}!='bot'`;
  const realFlow = `${STATUS}!='bot'`;
  // one row per person: their verdict, whether they tapped anything, how many visits and pages
  const person = (extra) => `SELECT ${extra}${PK} AS pk, ${AGG_STATUS} AS st, SUM(${HAS_WIN}) AS w, COUNT(DISTINCT sid) AS visits, COUNT(*) AS hits FROM hits`;
  const win = (lo, hi) => all(env, `SELECT COUNT(*) AS people, SUM(CASE WHEN st='real' THEN 1 ELSE 0 END) AS acted, SUM(CASE WHEN w>0 THEN 1 ELSE 0 END) AS wins, SUM(visits) AS visits, SUM(hits) AS pages FROM (${person('')} WHERE ts>=? AND ts<?${sq} GROUP BY pk) WHERE st!='bot'`, [lo, hi, ...sa]);
  const bots = (lo, hi) => all(env, `SELECT COUNT(DISTINCT ${PK}) AS n FROM hits WHERE ts>=? AND ts<? AND ${STATUS}='bot'${sq}`, [lo, hi, ...sa]);
  const pt = pacificOffset(now);
  const ptDay = `date(ts/1000${pt},'unixepoch')`;
  const [cur, prev, curBots, prevBots, actedDaily, sources, pages, flows, funnel, hours, broken, errors, speed, wins48, newSrc, botDay, botBase, fromGoogle, starts] = await Promise.all([
    win(since, now + 1), win(prevSince, since), bots(since, now + 1), bots(prevSince, since),
    all(env, `SELECT day, SUM(CASE WHEN w>0 THEN 1 ELSE 0 END) AS n FROM (${person(`${DAY} AS day, `)} WHERE ts>=?${sq} GROUP BY day, pk) WHERE st!='bot' GROUP BY day ORDER BY day`, [since, ...sa]),
    all(env, `SELECT ref_kind, ref_host, COUNT(*) AS visits, SUM(${HAS_WIN}) AS wins, ROUND(AVG(active),1) AS active FROM hits WHERE ts>=? AND ${real} AND ref_kind!='internal'${sq} GROUP BY ref_kind, ref_host ORDER BY visits DESC LIMIT 25`, [since, ...sa]),
    all(env, `SELECT site, path, COUNT(*) AS visits, SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.sid=hits.sid AND h2.ts<hits.ts) THEN 1 ELSE 0 END) AS entries, SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.sid=hits.sid AND h2.ts>hits.ts) THEN 1 ELSE 0 END) AS exits, SUM(${HAS_WIN}) AS wins, ROUND(AVG(scroll)) AS scroll, ROUND(AVG(active),1) AS active, ROUND(AVG(CASE WHEN lcp>0 THEN lcp END)) AS lcp FROM hits WHERE ts>=? AND ${real}${sq} GROUP BY site, path ORDER BY visits DESC LIMIT 40`, [since, ...sa]),
    // one pass over the period: each hit looks at the next hit of the same visit (LEAD), instead of joining the table to itself and re-checking every pair (that read about 32,000 rows to answer a question about 600)
    all(env, `SELECT site, path AS from_path, np AS to_path, COUNT(*) AS n FROM (SELECT site, path, me, wd, human, bot, dc, LEAD(path) OVER w AS np, LEAD(site) OVER w AS ns FROM hits WHERE ts>=?${site ? ' AND site=?' : ''} WINDOW w AS (PARTITION BY sid ORDER BY ts, id)) WHERE me=0 AND ${realFlow} AND np IS NOT NULL AND np!=path AND ns=site GROUP BY site, path, np ORDER BY n DESC LIMIT 15`, [since, ...sa]),
    all(env, `SELECT COUNT(*) AS sessions, SUM(CASE WHEN p>1 THEN 1 ELSE 0 END) AS multi, SUM(CASE WHEN w>0 THEN 1 ELSE 0 END) AS won FROM (SELECT ${PK} AS pk, COUNT(*) AS p, SUM(${HAS_WIN}) AS w FROM hits WHERE ts>=? AND ${real}${sq} GROUP BY pk)`, [since, ...sa]),
    all(env, `SELECT CAST(strftime('%H', ts/1000+${IST}, 'unixepoch') AS INTEGER) AS hour, CAST(strftime('%w', ts/1000+${IST}, 'unixepoch') AS INTEGER) AS dow, COUNT(DISTINCT sid) AS n FROM hits WHERE ts>=? AND ${real}${sq} GROUP BY hour, dow`, [since, ...sa]),
    all(env, `SELECT site, path, ref_host, COUNT(*) AS n, MAX(ts) AS last FROM hits WHERE ts>=? AND st>=400 AND ${notBot}${sq} GROUP BY site, path, ref_host ORDER BY n DESC LIMIT 20`, [since, ...sa]),
    all(env, `SELECT site, path, SUM(err) AS errors, COUNT(*) AS visits, MAX(ts) AS last FROM hits WHERE ts>=? AND err>0 AND ${notBot}${sq} GROUP BY site, path ORDER BY errors DESC LIMIT 15`, [since, ...sa]),
    all(env, `SELECT site, path, COUNT(*) AS n, ROUND(AVG(lcp)) AS lcp FROM hits WHERE ts>=? AND lcp>0 AND ${notBot}${sq} GROUP BY site, path HAVING n>=1 ORDER BY lcp DESC LIMIT 15`, [since, ...sa]),
    all(env, `SELECT hits.site, hits.path, c.kind, c.label, c.href, c.ts FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=? AND ${real} AND ${KEY_WIN}${sq.replace('site', 'hits.site')} ORDER BY c.ts DESC LIMIT 8`, [now - 48 * 36e5, ...sa]),
    all(env, `SELECT ref_kind, ref_host, MIN(ts) AS first, COUNT(*) AS n FROM hits WHERE ${real} AND ref_host!='' AND ref_kind NOT IN ('internal','own')${sq} AND (SELECT MIN(ts) FROM hits)<? GROUP BY ref_kind, ref_host HAVING MIN(ts)>=? ORDER BY first DESC LIMIT 8`, [...sa, now - 48 * 36e5, now - 48 * 36e5]),
    all(env, `SELECT COUNT(*) AS n FROM hits WHERE ts>=? AND ${STATUS}='bot'${sq}`, [now - 864e5, ...sa]),
    all(env, `SELECT COUNT(*) AS n FROM hits WHERE ts>=? AND ts<? AND ${STATUS}='bot'${sq}`, [now - 8 * 864e5, now - 864e5, ...sa]),
    // arrivals from Google per site and Pacific day, to hold against Search Console's clicks
    all(env, `SELECT site, ${ptDay} AS day, SUM(CASE WHEN ${STATUS}='real' THEN 1 ELSE 0 END) AS real, SUM(CASE WHEN ${STATUS}='real' THEN 0 ELSE 1 END) AS idle FROM hits WHERE ts>=? AND ref_kind='search' AND ref_host LIKE '%google%' AND ${notBot}${sq} GROUP BY site, day ORDER BY day`, [since, ...sa]),
    all(env, `SELECT site, MIN(${ptDay}) AS day FROM hits GROUP BY site`),
  ]);
  const cq = sq.replace('site', 'hits.site');
  // React's recoverable hydration errors (#418 text mismatch, #423 recovered, #425 text differs): on a page the browser
  // was translating they mean "translation changed the text before React started; React rebuilt the page", not a bug.
  const [errorMsgs, translatedRows, deadSpots, slowTaps, jumps, formsLeft, speedNet] = await Promise.all([
    // the actual script error messages, and how many happened on a translated page
    all(env, `SELECT site, path, msg, COUNT(*) AS n, SUM(tr) AS translated, MAX(ts) AS last, (CASE WHEN ${HYDRATION} THEN 1 ELSE 0 END) AS hydration FROM errs WHERE ts>=?${site ? ' AND site=?' : ''} GROUP BY site, path, msg ORDER BY n DESC LIMIT 20`, [since, ...sa]),
    // visits read through the browser's translation, by target language, and how many of them hit a script error
    all(env, `SELECT site, tl, COUNT(*) AS visits, SUM(CASE WHEN err>0 THEN 1 ELSE 0 END) AS errored FROM hits WHERE ts>=? AND tr=1 AND ${notBot}${sq} GROUP BY site, tl ORDER BY visits DESC LIMIT 15`, [since, ...sa]),
    // taps on things that do nothing, by page and element, from real people
    all(env, `SELECT hits.site, hits.path, c.label, c.sec, COUNT(*) AS n FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=? AND c.kind='other' AND ${real}${cq} GROUP BY hits.site, hits.path, c.label, c.sec ORDER BY n DESC LIMIT 15`, [since, ...sa]),
    // pages where a tap or key took 200 ms or more to show a response
    all(env, `SELECT site, path, COUNT(*) AS n, MAX(inp) AS worst, ROUND(AVG(inp)) AS avg FROM hits WHERE ts>=? AND inp>=200 AND ${notBot}${sq} GROUP BY site, path ORDER BY worst DESC LIMIT 10`, [since, ...sa]),
    // pages whose layout jumped (CLS 0.1 or more)
    all(env, `SELECT site, path, COUNT(*) AS n, ROUND(AVG(cls)) AS cls FROM hits WHERE ts>=? AND cls>=100 AND ${notBot}${sq} GROUP BY site, path ORDER BY cls DESC LIMIT 10`, [since, ...sa]),
    // forms people started and left without sending, next to how often each was sent
    all(env, `SELECT hits.site, hits.path, c.label AS form, COUNT(*) AS left_unsent, (SELECT COUNT(*) FROM clicks g WHERE g.site=hits.site AND g.kind='goal' AND g.label='form:'||c.label AND g.ts>=?) AS sent FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=? AND c.kind='fab' AND ${notBot}${cq} GROUP BY hits.site, hits.path, c.label ORDER BY left_unsent DESC LIMIT 10`, [since, since, ...sa]),
    // load time by connection type, so a slow network is not mistaken for a slow page
    all(env, `SELECT net, COUNT(*) AS n, ROUND(AVG(lcp)) AS lcp FROM hits WHERE ts>=? AND lcp>0 AND net!='' AND ${notBot}${sq} GROUP BY net ORDER BY n DESC`, [since, ...sa]),
  ]);

  const alerts = [];
  wins48.forEach((w) => alerts.push({ id: `win-${w.ts}`, level: 'good', ts: w.ts, site: w.site, title: w.kind === 'dl' ? `A real person downloaded ${w.href || w.label}` : w.kind === 'mail' ? 'A real person tapped an email link' : w.kind === 'tel' ? 'A real person tapped a phone link' : w.kind === 'goal' ? `Goal reached: ${w.label}` : 'A real person tapped WhatsApp', detail: w.path }));
  newSrc.forEach((s) => alerts.push({ id: `src-${s.ref_host}`, level: 'good', ts: s.first, site: '', title: `New source sent a real visitor: ${s.ref_host}`, detail: s.ref_kind }));
  const baseDaily = (botBase[0] && botBase[0].n ? botBase[0].n : 0) / 7;
  const today = (botDay[0] && botDay[0].n) || 0;
  if (today >= 20 && today > 3 * Math.max(baseDaily, 1)) alerts.push({ id: `bots-${istDay(now)}`, level: 'warn', ts: now, site: '', title: `Bot traffic is high today: ${today} visits (usual ${Math.round(baseDaily)} a day)`, detail: 'Not real people. Nothing to fix unless numbers elsewhere look wrong.' });
  broken.filter((b) => b.last >= now - 48 * 36e5).forEach((b) => alerts.push({ id: `404-${b.site}${b.path}`, level: 'bad', ts: b.last, site: b.site, title: `Someone reached a broken page (${b.path})`, detail: b.ref_host ? `They came from ${b.ref_host}` : 'Typed or bookmarked address' }));
  // a page whose only recent error messages are translation hydration noise does not get a "script error" alert
  const noisy = new Set(errorMsgs.filter((e) => e.hydration && e.translated === e.n).map((e) => `${e.site}${e.path}`));
  const realErr = new Set(errorMsgs.filter((e) => !(e.hydration && e.translated === e.n)).map((e) => `${e.site}${e.path}`));
  errorMsgs.forEach((e) => { e.noise = e.hydration && e.translated === e.n ? 1 : 0; });
  errors.forEach((e) => { e.noise = noisy.has(`${e.site}${e.path}`) && !realErr.has(`${e.site}${e.path}`) ? 1 : 0; });
  errors.filter((e) => e.last >= now - 48 * 36e5 && !e.noise).forEach((e) => alerts.push({ id: `js-${e.site}${e.path}`, level: 'warn', ts: e.last, site: e.site, title: `A script error happened on ${e.path}`, detail: `${e.errors} error${e.errors === 1 ? '' : 's'} in ${e.visits} visit${e.visits === 1 ? '' : 's'}` }));
  errorMsgs.filter((e) => e.last >= now - 48 * 36e5 && e.translated === e.n && !e.hydration).slice(0, 3).forEach((e) => alerts.push({ id: `tr-${e.site}${e.path}`, level: 'warn', ts: e.last, site: e.site, title: `Script errors on a translated page: ${e.path}`, detail: `The visitor's browser was translating the page. ${e.msg}` }));
  alerts.sort((a, b) => b.ts - a.ts);

  return {
    generatedAt: new Date().toISOString(), days, site: site || 'all',
    compare: { real: (cur[0] || {}).people || 0, acted: (cur[0] || {}).acted || 0, wins: (cur[0] || {}).wins || 0, visits: (cur[0] || {}).visits || 0, pages: (cur[0] || {}).pages || 0, bots: (curBots[0] || {}).n || 0, prevReal: (prev[0] || {}).people || 0, prevWins: (prev[0] || {}).wins || 0, prevBots: (prevBots[0] || {}).n || 0 },
    actedDaily, sources, pages, flows, funnel: funnel[0] || { sessions: 0, multi: 0, won: 0 }, hours, broken, errors, speed, alerts: alerts.slice(0, 20),
    health: { errorMsgs, translated: translatedRows, deadSpots, slowTaps, jumps, formsLeft, speedNet },
    // Search Console's day ends at midnight Pacific time; starts = the first day each site's tracker reported (a part day)
    google: { rows: fromGoogle, starts },
  };
}

// ---- goals: the moments a visitor became a lead or went on to the product ----

/** A click's goal, or NULL. Read from what the tracker already records, so no site has to change. Out links keep only
    host + first path part (for example play.google.com/store), which is what these patterns match. */
export const GOAL = `(CASE
  WHEN c.kind='out' AND (c.href LIKE 'wa.me%' OR c.href LIKE '%whatsapp%') THEN 'whatsapp'
  WHEN c.kind='mail' THEN 'email'
  WHEN c.kind='tel' THEN 'phone'
  WHEN c.kind='goal' AND c.label LIKE 'form:%' THEN 'form'
  WHEN c.kind='goal' THEN 'named'
  WHEN c.kind='dl' THEN 'download'
  WHEN c.kind='out' AND (c.href LIKE 'play.google.com%' OR c.href LIKE 'apps.apple.com%') THEN 'store'
  WHEN c.kind='out' AND c.href LIKE '%streamerosai.com%' THEN 'product'
  WHEN c.kind='out' AND (c.href LIKE 'github.com%' OR c.href LIKE 'www.github.com%') THEN 'github'
  ELSE NULL END)`;
export const GOAL_KEYS = ['whatsapp', 'email', 'phone', 'form', 'named', 'download', 'store', 'product', 'github'];

export async function goals(env, q) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const now = Date.now();
  const since = now - days * 864e5;
  const prevSince = since - days * 864e5;
  const realH = `(CASE WHEN hits.wd=1 THEN 'bot' WHEN hits.human=1 THEN 'real' WHEN hits.bot=1 OR hits.dc=1 THEN 'bot' ELSE 'unclear' END)!='bot'`;
  const pkH = `(CASE WHEN hits.vid!='' THEN hits.vid ELSE hits.sid END)`;
  const sq = site ? ' AND hits.site=?' : '';
  // every goal moment by a real person, the owner's own visits left out
  const rows = (lo, hi) => `SELECT ${GOAL} AS g, ${pkH} AS pk, hits.sid AS sid, hits.site AS site, hits.path AS path, c.label AS label, c.href AS href, c.ts AS ts
    FROM clicks c JOIN hits ON hits.id=c.hid WHERE c.ts>=${lo} AND c.ts<${hi} AND hits.me=0 AND ${realH}${sq}`;
  const cur = rows('?', '?');
  const a = [since, now + 864e5, ...(site ? [site] : [])]; // a click time is its page time plus up to a day
  const [types, prevTypes, bySite, people, converters, daily, pages, sources, recent] = await Promise.all([
    all(env, `SELECT g, COUNT(*) AS n, COUNT(DISTINCT pk) AS people FROM (${cur}) WHERE g IS NOT NULL GROUP BY g`, a),
    all(env, `SELECT g, COUNT(*) AS n, COUNT(DISTINCT pk) AS people FROM (${cur}) WHERE g IS NOT NULL GROUP BY g`, [prevSince, since, ...(site ? [site] : [])]),
    all(env, `SELECT site, g, COUNT(*) AS n FROM (${cur}) WHERE g IS NOT NULL GROUP BY site, g`, a),
    all(env, `SELECT site, COUNT(DISTINCT ${PK}) AS n FROM hits WHERE ts>=? AND me=0 AND ${PERSON}${site ? ' AND site=?' : ''} GROUP BY site`, [since, ...(site ? [site] : [])]),
    all(env, `SELECT site, COUNT(DISTINCT pk) AS n FROM (${cur}) WHERE g IS NOT NULL GROUP BY site`, a),
    all(env, `SELECT date(ts/1000+${IST},'unixepoch') AS day, g, COUNT(*) AS n FROM (${cur}) WHERE g IS NOT NULL GROUP BY day, g ORDER BY day`, a),
    all(env, `SELECT site, path, g, COUNT(*) AS n FROM (${cur}) WHERE g IS NOT NULL GROUP BY site, path, g ORDER BY n DESC LIMIT 25`, a),
    // where the people who reached a goal first came from: the first page of their visit
    all(env, `SELECT f.ref_kind AS ref_kind, f.ref_host AS ref_host, COUNT(DISTINCT x.pk) AS people, COUNT(*) AS n FROM (SELECT * FROM (${cur}) WHERE g IS NOT NULL) x
      JOIN hits f ON f.sid=x.sid AND f.ts=(SELECT MIN(h3.ts) FROM hits h3 WHERE h3.sid=x.sid) GROUP BY f.ref_kind, f.ref_host ORDER BY people DESC LIMIT 12`, a),
    all(env, `SELECT site, path, g, label, href, ts FROM (${cur}) WHERE g IS NOT NULL ORDER BY ts DESC LIMIT 15`, a),
  ]);
  const prev = new Map(prevTypes.map((r) => [r.g, r]));
  const sites = new Map();
  const siteRow = (h) => { if (!sites.has(h)) sites.set(h, { site: h, people: 0, converters: 0, goals: 0, byGoal: {} }); return sites.get(h); };
  people.forEach((r) => (siteRow(r.site).people = r.n));
  converters.forEach((r) => (siteRow(r.site).converters = r.n));
  bySite.forEach((r) => { const o = siteRow(r.site); o.byGoal[r.g] = r.n; o.goals += r.n; });
  return {
    generatedAt: new Date().toISOString(), days,
    types: GOAL_KEYS.map((g) => { const t = types.find((r) => r.g === g) || {}; const p = prev.get(g) || {}; return { goal: g, n: t.n || 0, people: t.people || 0, prevN: p.n || 0, prevPeople: p.people || 0 }; }),
    sites: [...sites.values()].sort((x, y) => y.goals - x.goals || y.people - x.people),
    daily, pages, sources, recent,
  };
}
