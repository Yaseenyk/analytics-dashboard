/**
 * NOT USED IN PRODUCTION (kept, verified, for a paid Workers plan). Measured on 750 page views: 50 to 200 ms of JavaScript per answer, against
 * the free Workers plan's limit of about 10 ms of processing time per request, so on the free plan the Worker would be stopped. The live path
 * is the SQL in lib.js behind the change-aware, budgeted cache in cache.js (governed). tests/agg.test.ts keeps this in step with the SQL.
 *
 * The dashboard's numbers (summary, insights, goals), worked out in memory from ONE read of the period's page views and clicks.
 *
 * Why: the same answers used to come from about 55 separate SQL questions, each scanning the whole period. That read about 70,000 rows to
 * answer a question about 750 (one page load), and the free D1 plan allows 5M rows read a day. Now one page load reads each row once
 * (about 3,000 rows today), however many questions are asked. The old SQL versions stay in lib.js (summarySql, insightsSql, goalsSql) as
 * the reference: tests compare the two answer for answer.
 *
 * Not a Worker entry file, so it may export helpers. Every rule below is the same rule the SQL had; comments name the SQL they replace.
 */
import { GOAL_KEYS, SITES } from './lib.js';

const IST = 19800;
const DAY_MS = 864e5;

// ---- the rules (the same as the SQL fragments STATUS, PERSON, WHY, PK, DAY in lib.js) ----

/** A visit's verdict, strongest evidence first (lib.js STATUS). */
export const statusOf = (r) => (r.wd === 1 ? 'bot' : r.human === 1 ? 'real' : r.bot === 1 || r.dc === 1 ? 'bot' : 'unclear');
export const isPerson = (r) => statusOf(r) !== 'bot';
/** One person on one day: the day's visitor code, or the tab id for rows from before the code existed (lib.js PK). */
export const pkOf = (r) => (r.vid !== '' && r.vid != null ? r.vid : r.sid);
/** Seconds a page was on screen (lib.js ON_SCREEN: MAX(seen,(last-ts)/1000), the division being whole-number division in SQL). */
const onScreen = (r) => Math.max(r.seen || 0, Math.trunc((r.last - r.ts) / 1000));
const whyOf = (r) => (r.wd === 1 ? 'auto' : r.human === 1 ? 'acted' : r.bot === 1 ? 'ua' : r.dc === 1 ? 'host' : onScreen(r) >= 3 ? 'stayed' : 'left');
const dayOf = (ms, offset = IST) => new Date((Math.floor(ms / 1000) + offset) * 1000).toISOString().slice(0, 10);
/** A click that counts as an action: anything except a tap on nothing or a form left unsent (lib.js WIN). */
const isWin = (c) => c.kind !== 'other' && c.kind !== 'fab';
const lowerHas = (s, part) => String(s || '').toLowerCase().includes(part);
const lowerStarts = (s, part) => String(s || '').toLowerCase().startsWith(part);
/** The moments worth an alert on their own (lib.js KEY_WIN). */
const isKeyWin = (c) => c.kind === 'dl' || c.kind === 'mail' || c.kind === 'tel' || c.kind === 'goal' || (c.kind === 'out' && (lowerStarts(c.href, 'wa.me') || lowerHas(c.href, 'whatsapp')));
/** A click's goal, or null (lib.js GOAL). */
export function goalOf(c) {
  const k = c.kind, h = c.href;
  if (k === 'out' && (lowerStarts(h, 'wa.me') || lowerHas(h, 'whatsapp'))) return 'whatsapp';
  if (k === 'mail') return 'email';
  if (k === 'tel') return 'phone';
  if (k === 'goal' && lowerStarts(c.label, 'form:')) return 'form';
  if (k === 'goal') return 'named';
  if (k === 'dl') return 'download';
  if (k === 'out' && (lowerStarts(h, 'play.google.com') || lowerStarts(h, 'apps.apple.com'))) return 'store';
  if (k === 'out' && lowerHas(h, 'streamerosai.com')) return 'product';
  if (k === 'out' && (lowerStarts(h, 'github.com') || lowerStarts(h, 'www.github.com'))) return 'github';
  return null;
}

// ---- small helpers that behave like the SQL they stand in for ----

const num = (v, d, lo, hi) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const siteOf = (q) => (SITES.includes(q) ? q : '');
export const daysOf = (q) => num(q.get('days'), 28, 1, 90);
export const siteParam = (q) => siteOf(q.get('site'));
/**
 * SQL ROUND(x, d) for the non-negative numbers used here, rounding the way SQLite does: with no decimals it is floor(x + 0.5); with decimals it
 * rounds the exact binary value (so 62.15, which is really 62.1499999..., gives 62.1, where Math.round(x * 10) / 10 would give 62.2).
 * Null stays null.
 */
const round = (x, d = 0) => (x == null || Number.isNaN(x) ? null : d === 0 ? Math.floor(x + 0.5) : Number(x.toFixed(d)));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const countBy = (rows, keyFn) => { const m = new Map(); rows.forEach((r) => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };
/** Group rows by a key (a string); remembers the first row's key parts. */
function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => { const k = keyFn(r); const g = m.get(k); if (g) g.push(r); else m.set(k, [r]); });
  return m;
}
const distinct = (rows, f) => new Set(rows.map(f)).size;
/** ORDER BY <metric> DESC, then LIMIT. Items that tie come out in reverse key order, which is what SQLite's sorter gives. */
function top(items, metric, limit, keyOf) {
  const out = items.slice().sort((a, b) => (b[metric] - a[metric]) || (keyOf(a) > keyOf(b) ? -1 : keyOf(a) < keyOf(b) ? 1 : 0));
  return limit ? out.slice(0, limit) : out;
}
const asc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sk = (...parts) => parts.map((p) => (p == null ? '' : String(p))).join('\u0001');

// ---- the one read ----

/**
 * Everything the numbers need, read once: the page views from `since` (one extra day back, because a click can come up to a day after its
 * page view) and the clicks from `since`. A click carries its page view's row.
 */
export async function loadPeriod(env, since) {
  const hitsAll = (await env.DB.prepare('SELECT * FROM hits WHERE ts>=?').bind(since - DAY_MS).all()).results || [];
  const clicksAll = (await env.DB.prepare('SELECT * FROM clicks WHERE ts>=?').bind(since).all()).results || [];
  const byId = new Map(hitsAll.map((h) => [h.id, h]));
  const clicks = [];
  clicksAll.forEach((c) => { const h = byId.get(c.hid); if (h) clicks.push({ ...c, h }); });
  return { hits: hitsAll, clicks, byId };
}

/** Which page views have at least one click that counts (lib.js HAS_WIN). */
function winSet(clicks) { const s = new Set(); clicks.forEach((c) => { if (isWin(c)) s.add(c.hid); }); return s; }

// ---- summary ----

/** Same answer as lib.js summarySql: who is looking, where from, doing what. */
export function summaryFrom(period, q, now = Date.now()) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const onlyPeople = q.get('who') !== 'all';
  const since = now - days * DAY_MS;
  const inBase = (r) => r.ts >= since && r.me === 0 && (!site || r.site === site);
  const base = period.hits.filter(inBase);
  const who = (r) => !onlyPeople || isPerson(r);
  const people = base.filter(who);
  const cl = period.clicks.filter((c) => c.ts >= since && c.h.me === 0 && (!site || c.site === site) && who(c.h));

  // one row per person (lib.js: GROUP BY pk with AGG_STATUS)
  const aggStatus = (rows) => (rows.some((r) => r.wd === 1) ? 'bot' : rows.some((r) => r.human === 1) ? 'real' : rows.some((r) => r.bot === 1 || r.dc === 1) ? 'bot' : 'unclear');
  const aggWhy = (rows) => (rows.some((r) => r.wd === 1) ? 'auto' : rows.some((r) => r.human === 1) ? 'acted' : rows.some((r) => r.bot === 1) ? 'ua' : rows.some((r) => r.dc === 1) ? 'host' : Math.max(...rows.map(onScreen)) >= 3 ? 'stayed' : 'left');
  const persons = [...groupBy(base, pkOf).entries()].map(([pk, rows]) => ({ pk, rows, status: aggStatus(rows), visits: distinct(rows, (r) => r.sid), hits: rows.length, active: sum(rows.map((r) => r.active)), scroll: sum(rows.map((r) => r.scroll)) }));

  const status = [...groupBy(persons, (p) => p.status).entries()].sort((a, b) => asc(a[0], b[0])).map(([st, ps]) => {
    const hits = sum(ps.map((p) => p.hits));
    return { status: st, people: ps.length, sessions: sum(ps.map((p) => p.visits)), hits, active: round(sum(ps.map((p) => p.active)) / hits, 1), scroll: round(sum(ps.map((p) => p.scroll)) / hits) };
  });
  const bySite = [...groupBy(
    [...groupBy(base, (r) => sk(r.site, pkOf(r))).values()].map((rows) => ({ site: rows[0].site, status: aggStatus(rows) })),
    (x) => sk(x.site, x.status)).values()].map((g) => ({ site: g[0].site, status: g[0].status, n: g.length })).sort((a, b) => asc(a.site, b.site) || asc(a.status, b.status));
  const kinds = top([...countBy(people, (r) => r.ref_kind).entries()].map(([ref_kind, n]) => ({ ref_kind, n })), 'n', 0, (x) => x.ref_kind);
  const hosts = top([...groupBy(people.filter((r) => r.ref_host !== ''), (r) => sk(r.ref_kind, r.ref_host)).values()].map((g) => ({ ref_kind: g[0].ref_kind, ref_host: g[0].ref_host, n: g.length })), 'n', 15, (x) => sk(x.ref_kind, x.ref_host));
  const pages = top([...groupBy(people, (r) => sk(r.site, r.path)).values()].map((g) => ({ site: g[0].site, path: g[0].path, n: g.length, active: round(sum(g.map((r) => r.active)) / g.length, 1), scroll: round(sum(g.map((r) => r.scroll)) / g.length) })), 'n', 20, (x) => sk(x.site, x.path));
  const countries = top([...groupBy(people.filter((r) => r.country !== ''), (r) => r.country).values()].map((g) => ({ country: g[0].country, n: distinct(g, pkOf) })), 'n', 12, (x) => x.country);
  const devices = top([...groupBy(people, (r) => sk(r.device, r.browser)).values()].map((g) => ({ device: g[0].device, browser: g[0].browser, n: distinct(g, pkOf) })), 'n', 12, (x) => sk(x.device, x.browser));
  const daily = [...groupBy(
    [...groupBy(base, (r) => sk(dayOf(r.ts), pkOf(r))).values()].map((rows) => ({ day: dayOf(rows[0].ts), status: aggStatus(rows) })),
    (x) => sk(x.day, x.status)).values()].map((g) => ({ day: g[0].day, status: g[0].status, n: g.length })).sort((a, b) => asc(a.day, b.day) || asc(a.status, b.status));
  const named = cl.filter((c) => c.kind !== 'other' && c.kind !== 'fab');
  const clicks = top([...groupBy(named, (c) => sk(c.site, c.kind, c.label, c.href)).values()].map((g) => ({ site: g[0].site, kind: g[0].kind, label: g[0].label, href: g[0].href, n: g.length, rage: sum(g.map((c) => c.z)) })), 'n', 25, (x) => sk(x.site, x.kind, x.label, x.href));
  const signals = cl.length ? { dead: cl.filter((c) => c.kind === 'other').length, rage: sum(cl.map((c) => c.z)), total: cl.length } : { dead: null, rage: null, total: 0 };
  const actions = [...groupBy(cl.filter((c) => ['dl', 'out', 'mail', 'tel', 'goal'].includes(c.kind)), (c) => sk(c.site, c.path, c.kind, c.label, c.href)).values()]
    .map((g) => ({ site: g[0].site, path: g[0].path, kind: g[0].kind, label: g[0].label, href: g[0].href, n: g.length, last: Math.max(...g.map((c) => c.ts)) }))
    .sort((a, b) => (b.last - a.last) || asc(sk(b.site, b.path, b.kind, b.label, b.href), sk(a.site, a.path, a.kind, a.label, a.href))).slice(0, 40);
  const bots = top([...groupBy(base.filter((r) => statusOf(r) === 'bot'), (r) => sk(r.org, whyOf(r))).values()].map((g) => ({ org: g[0].org, why: whyOf(g[0]), n: g.length, active: Math.max(...g.map((r) => r.active)), clicks: sum(g.map((r) => r.clicks)) })), 'n', 12, (x) => sk(x.org, x.why));
  const idle = [...countBy(persons.filter((p) => p.status === 'unclear'), (p) => aggWhy(p.rows)).entries()].map(([why, n]) => ({ why, n }));
  const mineRows = period.hits.filter((r) => r.ts >= since && r.me === 1 && (!site || r.site === site));
  const mine = { people: distinct(mineRows, pkOf), visits: distinct(mineRows, (r) => r.sid), hits: mineRows.length };
  const idleOf = (w) => (idle.find((r) => r.why === w) || {}).n || 0;
  return {
    generatedAt: new Date(now).toISOString(), days, site: site || 'all', who: onlyPeople ? 'real' : 'all', status, bySite, kinds, hosts, pages, countries, devices, daily, clicks, signals, actions, bots,
    idle: { left: idleOf('left'), stayed: idleOf('stayed') }, mine,
  };
}

// ---- insights ----

export const HYDRATION_RE = /React error #418|React error #423|React error #425|Hydration failed|did not match/i;

/** The rows insights needs besides page views and clicks: script errors (a small table) and when each source and site first appeared. */
export async function loadInsightExtras(env, site, since, now) {
  const all = async (sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
  const sa = site ? [site] : [];
  const [errs, firstSeen, siteStarts] = await Promise.all([
    all(`SELECT site, path, msg, tr, ts FROM errs WHERE ts>=?${site ? ' AND site=?' : ''}`, [since, ...sa]),
    // a source is new when its first visit by a person is in the last 48 hours: that needs the whole table's history (by source), so it is its own small question
    all(`SELECT ref_kind, ref_host, MIN(ts) AS first, COUNT(*) AS n FROM hits WHERE (CASE WHEN wd=1 THEN 'bot' WHEN human=1 THEN 'real' WHEN bot=1 OR dc=1 THEN 'bot' ELSE 'unclear' END)!='bot' AND ref_host!='' AND ref_kind NOT IN ('internal','own') AND me=0${site ? ' AND site=?' : ''} GROUP BY ref_kind, ref_host HAVING MIN(ts)>=? ORDER BY first DESC LIMIT 8`, [...sa, now - 48 * 36e5]),
    all('SELECT site, MIN(ts) AS m FROM hits GROUP BY site'),
  ]);
  return { errs, firstSeen, siteStarts };
}

/** Same answer as lib.js insightsSql. `pacific` is Search Console's day offset in seconds (-25200 or -28800); `istDayOf` names today in Indian time. */
export function insightsFrom(period, extras, q, now, pacific, istDayOf) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const since = now - days * DAY_MS;
  const prevSince = since - days * DAY_MS;
  const mine0 = (r) => r.me === 0 && (!site || r.site === site);
  const H = period.hits;
  const wins = winSet(period.clicks);
  const win = (r) => (wins.has(r.id) ? 1 : 0);
  const inRange = (lo, hi) => H.filter((r) => r.ts >= lo && r.ts < hi && mine0(r));
  const aggStatus = (rows) => (rows.some((r) => r.wd === 1) ? 'bot' : rows.some((r) => r.human === 1) ? 'real' : rows.some((r) => r.bot === 1 || r.dc === 1) ? 'bot' : 'unclear');

  const windowStats = (lo, hi) => {
    const persons = [...groupBy(inRange(lo, hi), pkOf).values()].map((rows) => ({ st: aggStatus(rows), w: sum(rows.map(win)), visits: distinct(rows, (r) => r.sid), hits: rows.length })).filter((p) => p.st !== 'bot');
    return persons.length ? { people: persons.length, acted: persons.filter((p) => p.st === 'real').length, wins: persons.filter((p) => p.w > 0).length, visits: sum(persons.map((p) => p.visits)), pages: sum(persons.map((p) => p.hits)) } : { people: 0, acted: null, wins: null, visits: null, pages: null };
  };
  const botCount = (lo, hi) => ({ n: distinct(inRange(lo, hi).filter((r) => statusOf(r) === 'bot'), pkOf) });
  const cur = windowStats(since, now + 1), prev = windowStats(prevSince, since);
  const curBots = botCount(since, now + 1), prevBots = botCount(prevSince, since);

  const cp = H.filter((r) => r.ts >= since && mine0(r)); // this period, the owner's own visits out
  const people = cp.filter(isPerson);
  const notBot = people; // lib.js: notBot and real are the same rule
  const actedDaily = [...groupBy(
    [...groupBy(cp, (r) => sk(dayOf(r.ts), pkOf(r))).values()].map((rows) => ({ day: dayOf(rows[0].ts), st: aggStatus(rows), w: sum(rows.map(win)) })).filter((x) => x.st !== 'bot'),
    (x) => x.day).entries()].map(([day, xs]) => ({ day, n: xs.filter((x) => x.w > 0).length })).sort((a, b) => asc(a.day, b.day));
  const sources = top([...groupBy(people.filter((r) => r.ref_kind !== 'internal'), (r) => sk(r.ref_kind, r.ref_host)).values()].map((g) => ({ ref_kind: g[0].ref_kind, ref_host: g[0].ref_host, visits: g.length, wins: sum(g.map(win)), active: round(sum(g.map((r) => r.active)) / g.length, 1) })), 'visits', 25, (x) => sk(x.ref_kind, x.ref_host));

  // entries and exits: first and last page view of each visit (tab) in the whole table; here, in what was read
  const firstTs = new Map(), lastTs = new Map();
  H.forEach((r) => { if (!firstTs.has(r.sid) || r.ts < firstTs.get(r.sid)) firstTs.set(r.sid, r.ts); if (!lastTs.has(r.sid) || r.ts > lastTs.get(r.sid)) lastTs.set(r.sid, r.ts); });
  const pages = top([...groupBy(people, (r) => sk(r.site, r.path)).values()].map((g) => {
    const lcps = g.filter((r) => r.lcp > 0).map((r) => r.lcp);
    return { site: g[0].site, path: g[0].path, visits: g.length, entries: g.filter((r) => r.ts === firstTs.get(r.sid)).length, exits: g.filter((r) => r.ts === lastTs.get(r.sid)).length, wins: sum(g.map(win)), scroll: round(sum(g.map((r) => r.scroll)) / g.length), active: round(sum(g.map((r) => r.active)) / g.length, 1), lcp: lcps.length ? round(sum(lcps) / lcps.length) : null };
  }), 'visits', 40, (x) => sk(x.site, x.path));

  // flows: each page view with the next one of the same visit (lib.js LEAD over sid ordered by ts, id)
  const flowRows = H.filter((r) => r.ts >= since && (!site || r.site === site));
  const flowCount = new Map();
  [...groupBy(flowRows, (r) => r.sid).values()].forEach((rows) => {
    rows.sort((a, b) => (a.ts - b.ts) || asc(a.id, b.id));
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a.me === 0 && isPerson(a) && b.path !== a.path && b.site === a.site) { const k = sk(a.site, a.path, b.path); const e = flowCount.get(k); if (e) e.n++; else flowCount.set(k, { site: a.site, from_path: a.path, to_path: b.path, n: 1 }); }
    }
  });
  const flows = top([...flowCount.values()], 'n', 15, (x) => sk(x.site, x.from_path, x.to_path));

  const perPerson = [...groupBy(people, pkOf).values()].map((rows) => ({ p: rows.length, w: sum(rows.map(win)) }));
  const funnel = perPerson.length ? { sessions: perPerson.length, multi: perPerson.filter((x) => x.p > 1).length, won: perPerson.filter((x) => x.w > 0).length } : { sessions: 0, multi: null, won: null };
  const hours = [...groupBy(people, (r) => sk(Math.floor(((Math.floor(r.ts / 1000) + IST) % 86400) / 3600), new Date((Math.floor(r.ts / 1000) + IST) * 1000).getUTCDay())).values()]
    .map((g) => ({ hour: Math.floor(((Math.floor(g[0].ts / 1000) + IST) % 86400) / 3600), dow: new Date((Math.floor(g[0].ts / 1000) + IST) * 1000).getUTCDay(), n: distinct(g, (r) => r.sid) }))
    .sort((a, b) => (a.hour - b.hour) || (a.dow - b.dow));
  const broken = top([...groupBy(notBot.filter((r) => r.st >= 400), (r) => sk(r.site, r.path, r.ref_host)).values()].map((g) => ({ site: g[0].site, path: g[0].path, ref_host: g[0].ref_host, n: g.length, last: Math.max(...g.map((r) => r.ts)) })), 'n', 20, (x) => sk(x.site, x.path, x.ref_host));
  const errors = top([...groupBy(notBot.filter((r) => r.err > 0), (r) => sk(r.site, r.path)).values()].map((g) => ({ site: g[0].site, path: g[0].path, errors: sum(g.map((r) => r.err)), visits: g.length, last: Math.max(...g.map((r) => r.ts)) })), 'errors', 15, (x) => sk(x.site, x.path));
  const speed = top([...groupBy(notBot.filter((r) => r.lcp > 0), (r) => sk(r.site, r.path)).values()].map((g) => ({ site: g[0].site, path: g[0].path, n: g.length, lcp: round(sum(g.map((r) => r.lcp)) / g.length) })), 'lcp', 15, (x) => sk(x.site, x.path));

  const wins48 = period.clicks.filter((c) => c.ts >= now - 48 * 36e5 && isPerson(c.h) && isKeyWin(c) && c.h.me === 0 && (!site || c.h.site === site))
    .sort((a, b) => b.ts - a.ts).slice(0, 8).map((c) => ({ site: c.h.site, path: c.h.path, kind: c.kind, label: c.label, href: c.href, ts: c.ts }));
  const newSrc = extras.firstSeen;
  const botDay = { n: H.filter((r) => r.ts >= now - DAY_MS && statusOf(r) === 'bot' && mine0(r)).length };
  const botBase = { n: H.filter((r) => r.ts >= now - 8 * DAY_MS && r.ts < now - DAY_MS && statusOf(r) === 'bot' && mine0(r)).length };
  const ptDay = (ms) => dayOf(ms, pacific);
  const fromGoogle = [...groupBy(people.filter((r) => r.ref_kind === 'search' && lowerHas(r.ref_host, 'google')), (r) => sk(r.site, ptDay(r.ts))).values()]
    .map((g) => ({ site: g[0].site, day: ptDay(g[0].ts), real: g.filter((r) => statusOf(r) === 'real').length, idle: g.filter((r) => statusOf(r) !== 'real').length })).sort((a, b) => asc(a.day, b.day) || asc(a.site, b.site));
  const starts = extras.siteStarts.map((s) => ({ site: s.site, day: ptDay(s.m) }));

  // the script errors table and the click-based health lists
  const errMsgs = top([...groupBy(extras.errs, (e) => sk(e.site, e.path, e.msg)).values()].map((g) => ({ site: g[0].site, path: g[0].path, msg: g[0].msg, n: g.length, translated: sum(g.map((e) => e.tr || 0)), last: Math.max(...g.map((e) => e.ts)), hydration: HYDRATION_RE.test(String(g[0].msg || '')) ? 1 : 0 })), 'n', 20, (x) => sk(x.site, x.path, x.msg));
  const translatedRows = top([...groupBy(notBot.filter((r) => r.tr === 1), (r) => sk(r.site, r.tl)).values()].map((g) => ({ site: g[0].site, tl: g[0].tl, visits: g.length, errored: g.filter((r) => r.err > 0).length })), 'visits', 15, (x) => sk(x.site, x.tl));
  const cc = period.clicks.filter((c) => c.ts >= since && c.h.me === 0 && (!site || c.h.site === site));
  const deadSpots = top([...groupBy(cc.filter((c) => c.kind === 'other' && isPerson(c.h)), (c) => sk(c.h.site, c.h.path, c.label, c.sec)).values()].map((g) => ({ site: g[0].h.site, path: g[0].h.path, label: g[0].label, sec: g[0].sec, n: g.length })), 'n', 15, (x) => sk(x.site, x.path, x.label, x.sec));
  const slowTaps = top([...groupBy(notBot.filter((r) => r.inp >= 200), (r) => sk(r.site, r.path)).values()].map((g) => ({ site: g[0].site, path: g[0].path, n: g.length, worst: Math.max(...g.map((r) => r.inp)), avg: round(sum(g.map((r) => r.inp)) / g.length) })), 'worst', 10, (x) => sk(x.site, x.path));
  const jumps = top([...groupBy(notBot.filter((r) => r.cls >= 100), (r) => sk(r.site, r.path)).values()].map((g) => ({ site: g[0].site, path: g[0].path, n: g.length, cls: round(sum(g.map((r) => r.cls)) / g.length) })), 'cls', 10, (x) => sk(x.site, x.path));
  const sentBy = countBy(period.clicks.filter((g) => g.kind === 'goal' && g.ts >= since), (g) => sk(g.site, g.label));
  const formsLeft = top([...groupBy(cc.filter((c) => c.kind === 'fab' && isPerson(c.h)), (c) => sk(c.h.site, c.h.path, c.label)).values()].map((g) => ({ site: g[0].h.site, path: g[0].h.path, form: g[0].label, left_unsent: g.length, sent: sentBy.get(sk(g[0].h.site, 'form:' + g[0].label)) || 0 })), 'left_unsent', 10, (x) => sk(x.site, x.path, x.form));
  const speedNet = top([...groupBy(notBot.filter((r) => r.lcp > 0 && r.net !== ''), (r) => r.net).values()].map((g) => ({ net: g[0].net, n: g.length, lcp: round(sum(g.map((r) => r.lcp)) / g.length) })), 'n', 0, (x) => x.net);

  // the alerts: the same rules as before, applied to the numbers above
  const alerts = [];
  wins48.forEach((w) => alerts.push({ id: `win-${w.ts}`, level: 'good', ts: w.ts, site: w.site, title: w.kind === 'dl' ? `A real person downloaded ${w.href || w.label}` : w.kind === 'mail' ? 'A real person tapped an email link' : w.kind === 'tel' ? 'A real person tapped a phone link' : w.kind === 'goal' ? `Goal reached: ${w.label}` : 'A real person tapped WhatsApp', detail: w.path }));
  newSrc.forEach((s) => alerts.push({ id: `src-${s.ref_host}`, level: 'good', ts: s.first, site: '', title: `New source sent a real visitor: ${s.ref_host}`, detail: s.ref_kind }));
  const baseDaily = (botBase.n || 0) / 7;
  const today = botDay.n || 0;
  if (today >= 20 && today > 3 * Math.max(baseDaily, 1)) alerts.push({ id: `bots-${istDayOf(now)}`, level: 'warn', ts: now, site: '', title: `Bot traffic is high today: ${today} visits (usual ${Math.round(baseDaily)} a day)`, detail: 'Not real people. Nothing to fix unless numbers elsewhere look wrong.' });
  broken.filter((b) => b.last >= now - 48 * 36e5).forEach((b) => alerts.push({ id: `404-${b.site}${b.path}`, level: 'bad', ts: b.last, site: b.site, title: `Someone reached a broken page (${b.path})`, detail: b.ref_host ? `They came from ${b.ref_host}` : 'Typed or bookmarked address' }));
  const noisy = new Set(errMsgs.filter((e) => e.hydration && e.translated === e.n).map((e) => `${e.site}${e.path}`));
  const realErr = new Set(errMsgs.filter((e) => !(e.hydration && e.translated === e.n)).map((e) => `${e.site}${e.path}`));
  errMsgs.forEach((e) => { e.noise = e.hydration && e.translated === e.n ? 1 : 0; });
  errors.forEach((e) => { e.noise = noisy.has(`${e.site}${e.path}`) && !realErr.has(`${e.site}${e.path}`) ? 1 : 0; });
  errors.filter((e) => e.last >= now - 48 * 36e5 && !e.noise).forEach((e) => alerts.push({ id: `js-${e.site}${e.path}`, level: 'warn', ts: e.last, site: e.site, title: `A script error happened on ${e.path}`, detail: `${e.errors} error${e.errors === 1 ? '' : 's'} in ${e.visits} visit${e.visits === 1 ? '' : 's'}` }));
  errMsgs.filter((e) => e.last >= now - 48 * 36e5 && e.translated === e.n && !e.hydration).slice(0, 3).forEach((e) => alerts.push({ id: `tr-${e.site}${e.path}`, level: 'warn', ts: e.last, site: e.site, title: `Script errors on a translated page: ${e.path}`, detail: `The visitor's browser was translating the page. ${e.msg}` }));
  alerts.sort((a, b) => b.ts - a.ts);

  return {
    generatedAt: new Date(now).toISOString(), days, site: site || 'all',
    compare: { real: cur.people || 0, acted: cur.acted || 0, wins: cur.wins || 0, visits: cur.visits || 0, pages: cur.pages || 0, bots: curBots.n || 0, prevReal: prev.people || 0, prevWins: prev.wins || 0, prevBots: prevBots.n || 0 },
    actedDaily, sources, pages, flows, funnel, hours, broken, errors, speed, alerts: alerts.slice(0, 20),
    health: { errorMsgs: errMsgs, translated: translatedRows, deadSpots, slowTaps, jumps, formsLeft, speedNet },
    google: { rows: fromGoogle, starts },
  };
}

// ---- goals ----

/** Same answer as lib.js goalsSql: the moments a visitor became a lead or went on to the product. */
export function goalsFrom(period, q, now = Date.now()) {
  const days = num(q.get('days'), 28, 1, 90);
  const site = siteOf(q.get('site'));
  const since = now - days * DAY_MS;
  const prevSince = since - days * DAY_MS;
  // every goal moment by a real person, the owner's own visits left out; a click time is its page time plus up to a day
  const moments = (lo, hi) => period.clicks.filter((c) => c.ts >= lo && c.ts < hi && c.h.me === 0 && isPerson(c.h) && (!site || c.h.site === site))
    .map((c) => ({ g: goalOf(c), pk: pkOf(c.h), sid: c.h.sid, site: c.h.site, path: c.h.path, label: c.label, href: c.href, ts: c.ts })).filter((x) => x.g !== null);
  const cur = moments(since, now + DAY_MS), prevM = moments(prevSince, since);
  const typeRows = (ms) => [...groupBy(ms, (m) => m.g).values()].map((g) => ({ g: g[0].g, n: g.length, people: distinct(g, (m) => m.pk) }));
  const types = typeRows(cur), prevTypes = typeRows(prevM);
  const bySite = [...groupBy(cur, (m) => sk(m.site, m.g)).values()].map((g) => ({ site: g[0].site, g: g[0].g, n: g.length }));
  const peopleBySite = [...groupBy(period.hits.filter((r) => r.ts >= since && r.me === 0 && isPerson(r) && (!site || r.site === site)), (r) => r.site).values()].map((g) => ({ site: g[0].site, n: distinct(g, pkOf) }));
  const converters = [...groupBy(cur, (m) => m.site).values()].map((g) => ({ site: g[0].site, n: distinct(g, (m) => m.pk) }));
  const daily = [...groupBy(cur, (m) => sk(dayOf(m.ts), m.g)).values()].map((g) => ({ day: dayOf(g[0].ts), g: g[0].g, n: g.length })).sort((a, b) => asc(a.day, b.day) || asc(a.g, b.g));
  const pages = top([...groupBy(cur, (m) => sk(m.site, m.path, m.g)).values()].map((g) => ({ site: g[0].site, path: g[0].path, g: g[0].g, n: g.length })), 'n', 25, (x) => sk(x.site, x.path, x.g));
  // where the people who reached a goal first came from: the first page of their visit
  const firstHits = new Map();
  period.hits.forEach((h) => { const f = firstHits.get(h.sid); if (!f || h.ts < f.ts) firstHits.set(h.sid, { ts: h.ts, rows: [h] }); else if (h.ts === f.ts) f.rows.push(h); });
  const joined = [];
  cur.forEach((m) => { const f = firstHits.get(m.sid); if (f) f.rows.forEach((h) => joined.push({ ref_kind: h.ref_kind, ref_host: h.ref_host, pk: m.pk })); });
  const sources = [...groupBy(joined, (x) => sk(x.ref_kind, x.ref_host)).values()].map((g) => ({ ref_kind: g[0].ref_kind, ref_host: g[0].ref_host, people: distinct(g, (x) => x.pk), n: g.length })).sort((a, b) => (b.people - a.people) || asc(sk(b.ref_kind, b.ref_host), sk(a.ref_kind, a.ref_host))).slice(0, 12);
  const recent = cur.slice().sort((a, b) => b.ts - a.ts).slice(0, 15).map((m) => ({ site: m.site, path: m.path, g: m.g, label: m.label, href: m.href, ts: m.ts }));

  const prev = new Map(prevTypes.map((r) => [r.g, r]));
  const sites = new Map();
  const siteRow = (h) => { if (!sites.has(h)) sites.set(h, { site: h, people: 0, converters: 0, goals: 0, byGoal: {} }); return sites.get(h); };
  peopleBySite.forEach((r) => (siteRow(r.site).people = r.n));
  converters.forEach((r) => (siteRow(r.site).converters = r.n));
  bySite.forEach((r) => { const o = siteRow(r.site); o.byGoal[r.g] = r.n; o.goals += r.n; });
  return {
    generatedAt: new Date(now).toISOString(), days,
    types: GOAL_KEYS.map((g) => { const t = types.find((r) => r.g === g) || {}; const p = prev.get(g) || {}; return { goal: g, n: t.n || 0, people: t.people || 0, prevN: p.n || 0, prevPeople: p.people || 0 }; }),
    sites: [...sites.values()].sort((x, y) => y.goals - x.goals || y.people - x.people),
    daily, pages, sources, recent,
  };
}
