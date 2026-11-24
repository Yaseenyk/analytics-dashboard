/**
 * Form inbox: every enquiry, sign-up and feedback form on the sites posts here, so a message is kept even when email
 * delivery fails, and leads can be analysed next to the visit that produced them.
 *
 *   POST /lead              public, from the sites' own pages only (Origin must be one of SITES). Always small answers.
 *   GET  /v/leads           the inbox and its breakdowns            needs PULSE_KEY
 *   POST /v/leads/update    set a lead's status or note             needs PULSE_KEY
 *
 * Stored: what the visitor typed into the form (name, email, phone, message, a few named extra fields), the form's name,
 * the page, and the visit's own source (search, ChatGPT, LinkedIn...) read from the tracker's tab id. Never stored:
 * IP address, user agent. Leads are kept for 24 months (spam for 30 days), not the 90 days visits are kept.
 */
import { SITES, classifyRef } from './lib.js';

export const LEAD_STATUSES = ['new', 'replied', 'won', 'lost', 'spam'];
export const LEAD_RETENTION_DAYS = 730;
const MAX_BODY = 16000;

const s = (v, n) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, n) : typeof v === 'number' ? String(v).slice(0, n) : '');
const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;

const recent = new Map();
/** Five forms per ten minutes from one address is plenty for a person and stops a flood. The address is only held in memory. */
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 600000);
  if (recent.size > 5000) recent.clear();
  list.push(now);
  recent.set(ip, list);
  return list.length > 5;
}

/** CORS for the public endpoint: only our own sites. */
export function leadCors(req) {
  const o = req.headers.get('Origin') || '';
  let host = '';
  try { host = new URL(o).hostname.replace(/^www\./, ''); } catch { /* none */ }
  const h = { Vary: 'Origin' };
  if (SITES.includes(host) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return { headers: h, host };
}

/** Validate and normalise one submission. Returns null when it should be ignored. Pure, so it is tested. */
export function cleanLead(m, originHost) {
  if (!m || typeof m !== 'object') return null;
  const site = s(m.site, 60);
  if (!SITES.includes(site)) return null;
  if (originHost && originHost !== site) return null;
  if (s(m.website, 100)) return { honeypot: true };
  const email = s(m.email, 120).toLowerCase();
  const lead = {
    site, form: s(m.form, 40).replace(/[^\w .:\-]/g, '') || 'form',
    name: s(m.name, 80), email: EMAIL.test(email) ? email : '', phone: s(m.phone, 30).replace(/[^\d+()\- ]/g, ''),
    message: s(m.message, 4000), path: s(m.path, 120).split(/[?#]/)[0], sid: s(m.sid, 20).replace(/[^\w]/g, ''),
    extra: {},
  };
  if (email && !lead.email) return null; // a typed but malformed address: let the form show its own error
  if (m.extra && typeof m.extra === 'object' && !Array.isArray(m.extra)) {
    for (const [k, v] of Object.entries(m.extra).slice(0, 15)) {
      const key = s(k, 30).replace(/[^\w\- ]/g, '');
      const val = s(v, 300);
      if (key && val) lead.extra[key] = val;
    }
  }
  if (!lead.email && !lead.phone && !lead.message && !Object.keys(lead.extra).length) return null;
  return lead;
}

export async function receiveLead(req, env, host) {
  const text = await req.text();
  if (text.length > MAX_BODY) return { status: 413, body: { ok: false, error: 'too long' } };
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (tooMany(ip)) return { status: 429, body: { ok: false, error: 'too many forms, try again in a few minutes' } };
  let m;
  try { m = JSON.parse(text); } catch { return { status: 400, body: { ok: false, error: 'bad form' } }; }
  const lead = cleanLead(m, host);
  if (!lead) return { status: 400, body: { ok: false, error: 'missing or invalid fields' } };
  if (lead.honeypot) return { status: 200, body: { ok: true } }; // a bot cannot tell it was ignored
  const id = crypto.randomUUID();
  const now = Date.now();
  // where this visit came from: the first page of the same tab on the same site
  const first = lead.sid
    ? ((await env.DB.prepare('SELECT path, ref_host, ref_kind, utm_source, utm_medium, utm_campaign FROM hits WHERE sid=? AND site=? ORDER BY ts LIMIT 1').bind(lead.sid, lead.site).all()).results || [])[0]
    : null;
  const refHost = first ? first.ref_host : '';
  const refKind = first ? first.ref_kind : classifyRef('', lead.site, '', '');
  const country = String((req.cf && req.cf.country) || '').slice(0, 2);
  await env.DB.prepare(`INSERT INTO leads (id,ts,site,form,name,email,phone,message,extra,path,landing,sid,ref_host,ref_kind,utm_source,utm_medium,utm_campaign,country,status,note,updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new','',?)`).bind(
    id, now, lead.site, lead.form, lead.name, lead.email, lead.phone, lead.message, JSON.stringify(lead.extra), lead.path,
    first ? first.path : '', lead.sid, refHost, first ? refKind : 'unknown', first ? first.utm_source : '', first ? first.utm_medium : '', first ? first.utm_campaign : '',
    country, now).run();
  return { status: 200, body: { ok: true, id } };
}

const all = async (env, sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];

export async function listLeads(env, q) {
  const days = Math.min(3650, Math.max(1, parseInt(q.get('days') || '365', 10) || 365));
  const site = SITES.includes(q.get('site')) ? q.get('site') : '';
  const status = LEAD_STATUSES.includes(q.get('status')) ? q.get('status') : '';
  const since = Date.now() - days * 864e5;
  const w = `ts>=?${site ? ' AND site=?' : ''}`;
  const a = [since, ...(site ? [site] : [])];
  const real = `${w} AND status!='spam'`;
  const [rows, bySite, byForm, bySource, daily, byStatus] = await Promise.all([
    all(env, `SELECT id, ts, site, form, name, email, phone, message, extra, path, landing, ref_host, ref_kind, utm_source, utm_campaign, country, status, note, updated FROM leads WHERE ${w}${status ? ' AND status=?' : ''} ORDER BY ts DESC LIMIT 500`, [...a, ...(status ? [status] : [])]),
    all(env, `SELECT site, COUNT(*) AS n, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS won FROM leads WHERE ${real} GROUP BY site ORDER BY n DESC`, a),
    all(env, `SELECT site, form, COUNT(*) AS n FROM leads WHERE ${real} GROUP BY site, form ORDER BY n DESC LIMIT 30`, a),
    all(env, `SELECT ref_kind, ref_host, COUNT(*) AS n, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS won FROM leads WHERE ${real} GROUP BY ref_kind, ref_host ORDER BY n DESC LIMIT 20`, a),
    all(env, `SELECT date(ts/1000+19800,'unixepoch') AS day, COUNT(*) AS n FROM leads WHERE ${real} GROUP BY day ORDER BY day`, a),
    all(env, `SELECT status, COUNT(*) AS n FROM leads WHERE ${w} GROUP BY status`, a),
  ]);
  rows.forEach((r) => { try { r.extra = JSON.parse(r.extra || '{}'); } catch { r.extra = {}; } });
  return { generatedAt: new Date().toISOString(), days, site: site || 'all', rows, bySite, byForm, bySource, daily, byStatus };
}

export async function updateLead(env, body) {
  const id = s(body && body.id, 40);
  if (!id) return { ok: false, error: 'id needed' };
  const sets = [], args = [];
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status)) return { ok: false, error: 'unknown status' };
    sets.push('status=?'); args.push(body.status);
  }
  if (body.note !== undefined) { sets.push('note=?'); args.push(s(body.note, 1000)); }
  if (!sets.length) return { ok: false, error: 'nothing to change' };
  const r = await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')}, updated=? WHERE id=?`).bind(...args, Date.now(), id).run();
  return { ok: true, changed: (r && r.meta && r.meta.changes) || 0 };
}
