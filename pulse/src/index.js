/**
 * pulse Worker entry. A Worker module may export only its handler, so every helper lives in lib.js (and is tested there).
 * Routes are listed at the top of lib.js.
 */
import { RETENTION_DAYS, authorised, clickmap, cors, feed, ingest, insights, istDay, journey, json, live, markMine, meStep, summary } from './lib.js';
import { TRACKER } from './tracker.js';

export default {
  async scheduled(event, env) {
    const cut = Date.now() - RETENTION_DAYS * 864e5;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM clicks WHERE ts<?').bind(cut),
      env.DB.prepare('DELETE FROM hits WHERE ts<?').bind(cut),
      // yesterday's salt goes, so yesterday's visitor codes can never be worked back to an address
      env.DB.prepare('DELETE FROM salts WHERE day<?').bind(istDay(Date.now())),
    ]);
  },

  async fetch(req, env) {
    const ch = cors(req);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

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
        return json(await markMine(env, await req.json()), ch);
      } catch (e) {
        console.error('mark failed:', String((e && e.message) || e));
        return json({ error: 'mark failed' }, ch, 500);
      }
    }

    if (req.method === 'GET' && url.pathname.startsWith('/v/')) {
      const q = url.searchParams;
      try {
        if (url.pathname === '/v/summary') return json(await summary(env, q), ch, 200, 'public, max-age=30');
        if (url.pathname === '/v/insights') return json(await insights(env, q), ch, 200, 'public, max-age=30');
        if (url.pathname === '/v/live') return json(await live(env, q), ch);
        if (['/v/feed', '/v/journey', '/v/clickmap'].includes(url.pathname)) {
          if (!env.PULSE_KEY) return json({ error: 'PULSE_KEY is not set on the Worker' }, ch, 503);
          if (!authorised(req, env)) return json({ error: 'wrong key' }, ch, 401);
          if (url.pathname === '/v/feed') return json(await feed(env, q), ch);
          if (url.pathname === '/v/journey') return json(await journey(env, q), ch);
          return json(await clickmap(env, q), ch);
        }
      } catch (e) {
        console.error('read failed:', String((e && e.message) || e));
        return json({ error: 'read failed' }, ch, 500);
      }
    }
    return new Response('not found', { status: 404, headers: ch });
  },
};
