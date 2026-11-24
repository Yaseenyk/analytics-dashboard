/**
 * pulse Worker entry. A Worker module may export only its handler, so every helper lives in lib.js (and is tested there).
 * Routes are listed at the top of lib.js.
 */
import { esportsStats } from './esports.js';
import { LEAD_RETENTION_DAYS, leadCors, listLeads, receiveLead, updateLead } from './leads.js';
import { PK, RETENTION_DAYS, STATUS, authorised, clickmap, cors, feed, goals, ingest, insights, istDay, journey, json, live, markMine, meStep, summary } from './lib.js';
import { TRACKER } from './tracker.js';

// The free D1 plan allows 5M rows read a day and every dashboard poll scans a whole period, so answers are
// remembered briefly inside the Worker: one tab or ten, the database is asked once per window.
// (Cache API is a no-op on workers.dev, so this is a plain per-isolate Map, one per database binding.)
const MEMOS = new WeakMap();
async function memo(env, key, ttlMs, fn) {
  let m = MEMOS.get(env.DB);
  if (!m) MEMOS.set(env.DB, (m = new Map()));
  const now = Date.now();
  const hit = m.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fn();
  if (m.size > 300) m.clear();
  m.set(key, { exp: now + ttlMs, val });
  return val;
}

export default {
  async scheduled(event, env) {
    const cut = Date.now() - RETENTION_DAYS * 864e5;
    // Bot visits are kept for one day (so the Watch page can still show them), then dropped, which keeps the table
    // small and the dashboard cheap to read. A visitor who ever showed a human sign is never touched.
    const botCut = Date.now() - 864e5;
    const oldBots = `SELECT id FROM hits WHERE ts<? AND ${STATUS}='bot' AND ${PK} NOT IN (SELECT ${PK} FROM hits WHERE human=1 AND wd=0)`;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM clicks WHERE hid IN (${oldBots})`).bind(botCut),
      env.DB.prepare(`DELETE FROM hits WHERE id IN (${oldBots})`).bind(botCut),
      env.DB.prepare('DELETE FROM clicks WHERE ts<?').bind(cut),
      env.DB.prepare('DELETE FROM errs WHERE ts<?').bind(cut),
      // form messages are kept longer than visits: 24 months, spam 30 days
      env.DB.prepare('DELETE FROM leads WHERE ts<?').bind(Date.now() - LEAD_RETENTION_DAYS * 864e5),
      env.DB.prepare("DELETE FROM leads WHERE status='spam' AND updated<?").bind(Date.now() - 30 * 864e5),
      env.DB.prepare('DELETE FROM hits WHERE ts<?').bind(cut),
      // yesterday's salt goes, so yesterday's visitor codes can never be worked back to an address
      env.DB.prepare('DELETE FROM salts WHERE day<?').bind(istDay(Date.now())),
    ]);
  },

  async fetch(req, env) {
    const ch = cors(req);
    const url = new URL(req.url);
    // Form inbox: public, but only from our own sites' pages.
    if (url.pathname === '/lead') {
      const lc = leadCors(req);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: lc.headers });
      if (req.method !== 'POST') return new Response(null, { status: 405, headers: lc.headers });
      if (!lc.headers['Access-Control-Allow-Origin']) return json({ ok: false, error: 'not one of our sites' }, lc.headers, 403);
      try {
        const r = await receiveLead(req, env, lc.host);
        return json(r.body, lc.headers, r.status);
      } catch (e) {
        console.error('lead failed:', String((e && e.message) || e));
        return json({ ok: false, error: 'could not save, please try again' }, lc.headers, 500);
      }
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    if (url.pathname === '/v/esports' && req.method === 'GET') {
      if (!env.PULSE_KEY) return json({ error: 'PULSE_KEY is not set on the Worker' }, ch, 503);
      if (!authorised(req, env)) return json({ error: 'wrong key' }, ch, 401);
      try { return json(await esportsStats(env, url.searchParams), ch); } catch (e) {
        console.error('esports read failed:', String((e && e.message) || e));
        return json({ error: 'esports read failed' }, ch, 500);
      }
    }
    if (url.pathname === '/v/leads' || url.pathname === '/v/leads/update') {
      if (!env.PULSE_KEY) return json({ error: 'PULSE_KEY is not set on the Worker' }, ch, 503);
      if (!authorised(req, env)) return json({ error: 'wrong key' }, ch, 401);
      try {
        if (req.method === 'GET' && url.pathname === '/v/leads') return json(await listLeads(env, url.searchParams), ch);
        if (req.method === 'POST' && url.pathname === '/v/leads/update') return json(await updateLead(env, await req.json()), ch);
      } catch (e) {
        console.error('leads read failed:', String((e && e.message) || e));
        return json({ error: 'leads failed' }, ch, 500);
      }
      return new Response(null, { status: 405, headers: ch });
    }

    if (url.pathname === '/p.js' && req.method === 'GET') {
      return new Response(TRACKER, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.pathname === '/e') {
      if (req.method !== 'POST') return new Response(null, { status: 405 });
      try { await ingest(req, env); } catch (e) { console.error('ingest failed:', String((e && e.message) || e)); }
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': req.headers.get('Origin') || '*' } });
    }
    if (url.pathname === '/health') return new Response('ok', { headers: ch });
    if (url.pathname === '/me' && req.method === 'GET') return new Response(null, { status: 302, headers: { Location: meStep(url.searchParams), 'Cache-Control': 'no-store' } });

    if (req.method === 'POST' && url.pathname === '/v/mine') {
      if (!env.PULSE_KEY) return json({ error: 'PULSE_KEY is not set on the Worker' }, ch, 503);
      if (!authorised(req, env)) return json({ error: 'wrong key' }, ch, 401);
      try {
        MEMOS.delete(env.DB);
        return json(await markMine(env, await req.json()), ch);
      } catch (e) {
        console.error('mark failed:', String((e && e.message) || e));
        return json({ error: 'mark failed' }, ch, 500);
      }
    }

    if (req.method === 'GET' && url.pathname.startsWith('/v/')) {
      const q = url.searchParams;
      try {
        if (url.pathname === '/v/summary') return json(await memo(env, url.search + '|summary', 60000, () => summary(env, q)), ch, 200, 'public, max-age=30');
        if (url.pathname === '/v/insights') return json(await memo(env, url.search + '|insights', 60000, () => insights(env, q)), ch, 200, 'public, max-age=30');
        if (url.pathname === '/v/goals') return json(await memo(env, url.search + '|goals', 60000, () => goals(env, q)), ch, 200, 'public, max-age=30');
        if (url.pathname === '/v/live') return json(await memo(env, url.search + '|live', 8000, () => live(env, q)), ch);
        if (['/v/feed', '/v/journey', '/v/clickmap'].includes(url.pathname)) {
          if (!env.PULSE_KEY) return json({ error: 'PULSE_KEY is not set on the Worker' }, ch, 503);
          if (!authorised(req, env)) return json({ error: 'wrong key' }, ch, 401);
          if (url.pathname === '/v/feed') return json(await memo(env, url.search + '|feed', 10000, () => feed(env, q)), ch);
          if (url.pathname === '/v/journey') return json(await memo(env, url.search + '|journey', 30000, () => journey(env, q)), ch);
          return json(await memo(env, url.search + '|clickmap', 30000, () => clickmap(env, q)), ch);
        }
      } catch (e) {
        console.error('read failed:', String((e && e.message) || e));
        return json({ error: 'read failed' }, ch, 500);
      }
    }
    return new Response('not found', { status: 404, headers: ch });
  },
};
