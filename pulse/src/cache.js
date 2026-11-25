/**
 * Saved answers for the dashboard (table rcache). The free D1 plan allows 5M rows read a day, so an answer just computed is kept for a few
 * minutes and shared by every tab and Worker instance: a page load still calls the tracker, but only the first call in a window computes.
 * Not a Worker entry file, so it may export helpers.
 */
import { countingEnv } from './dev.js';

const READY = new WeakSet();

export async function cacheTable(env) {
  if (READY.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rcache (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rbudget (day TEXT PRIMARY KEY, rows INTEGER NOT NULL)').run();
  READY.add(env.DB);
}

/** One key for one question however the parameters were ordered or what else rode along (fresh). */
export function cacheKey(name, search) {
  const q = new URLSearchParams(search);
  q.delete('fresh');
  q.sort();
  const s = q.toString();
  return name + (s ? '?' + s : '');
}

/** The stored answer, whatever its age: { v: json text, t: when it was computed } or null. */
export async function getStored(env, key) {
  try {
    await cacheTable(env);
    const r = ((await env.DB.prepare('SELECT v, t FROM rcache WHERE k=?').bind(key).all()).results || [])[0];
    return r || null;
  } catch (e) {
    console.error('cache read failed:', String((e && e.message) || e));
    return null;
  }
}

export async function putStored(env, key, val, now = Date.now()) {
  try {
    await cacheTable(env);
    await env.DB.prepare('INSERT INTO rcache (k,v,t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, t=excluded.t').bind(key, JSON.stringify(val), now).run();
  } catch (e) {
    console.error('cache write failed:', String((e && e.message) || e));
  }
}

/** The stored answer if it is younger than ttlMs (a Refresh press passes fresh and accepts only one under a minute old); else compute and store. */
export async function stored(env, key, ttlMs, fn, fresh = false) {
  const now = Date.now();
  const r = await getStored(env, key);
  if (r && now - r.t < (fresh ? 60000 : ttlMs)) return JSON.parse(r.v);
  const val = await fn();
  await putStored(env, key, val, now);
  return val;
}

// ---- answers that cost the database only when something changed, and never more than the free plan allows ----

/**
 * The free D1 plan allows 5,000,000 rows read a day (counted from 00:00 UTC). One calculation of the dashboard's numbers reads tens of
 * thousands of rows, so the rule is:
 *  1. An answer is worked out again only when new data has arrived since it was made (one-row check), and then at most once every
 *     "gap". With no new data it is reused for up to half an hour (only the sliding date windows move).
 *  2. Every calculation adds the rows it really read (D1 reports them) to today's tally, and the gap grows as the tally fills:
 *     2 minutes below 40% of the day's allowance, 10 minutes below 70%, an hour below 90%, and past 90% the saved answer is
 *     served as it is. So the limit cannot be passed, and the numbers stay exact, only a little older, on a busy day.
 *  3. A Refresh press (fresh) may skip the gap, but not once the allowance is 95% used, and not within 30 seconds of the last answer.
 */
export const DAILY_ROWS = 5000000;
const HALF_HOUR = 30 * 60 * 1000;
export const budgetDay = (now) => new Date(now).toISOString().slice(0, 10);

export async function budgetUsed(env, now = Date.now()) {
  try {
    await cacheTable(env);
    const r = ((await env.DB.prepare('SELECT rows FROM rbudget WHERE day=?').bind(budgetDay(now)).all()).results || [])[0];
    return r ? Number(r.rows) : 0;
  } catch { return 0; }
}

async function addBudget(env, rows, now) {
  if (!rows) return;
  try { await env.DB.prepare('INSERT INTO rbudget (day, rows) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET rows = rows + excluded.rows').bind(budgetDay(now), rows).run(); } catch { /* the tally is a guard, never a reason to fail */ }
}

/** How long to wait between calculations, given how much of today's allowance is used. */
export function gapFor(used, baseMs = 120000) {
  const f = used / DAILY_ROWS;
  return f < 0.4 ? baseMs : f < 0.7 ? Math.max(baseMs, 600000) : f < 0.9 ? Math.max(baseMs, 3600000) : Infinity;
}

/** The newest activity in the table: changes when a visit starts, a page is opened or a heartbeat updates one. One row read, through the index on `last`. */
export async function dataVersion(env) {
  try { return ((await env.DB.prepare('SELECT MAX(last) AS v FROM hits').bind().all()).results || [])[0]?.v ?? 0; } catch { return 0; }
}

/** What a read that was `governed` did, for tests and for the dev headers. */
export const lastDecision = new WeakMap();

export async function governed(env, key, fn, { fresh = false, baseGap = 120000, maxAge = HALF_HOUR } = {}) {
  const now = Date.now();
  const r = await getStored(env, key);
  let saved = null;
  if (r) { try { const j = JSON.parse(r.v); if (j && typeof j === 'object' && 'val' in j) saved = j; } catch { /* an older kind of entry: treat as missing */ } }
  const used = await budgetUsed(env, now);
  if (saved) {
    const age = now - r.t;
    let reuse;
    if (fresh) reuse = age < 30000 || used >= DAILY_ROWS * 0.95;
    else if (used >= DAILY_ROWS * 0.9) reuse = true; // the allowance is nearly gone: keep what we have
    else if (age >= maxAge) reuse = false;
    else if (age < gapFor(used, baseGap)) reuse = true;
    else reuse = (await dataVersion(env)) === saved.ver; // nothing new since it was made
    if (reuse) return saved.val;
  }
  const ver = await dataVersion(env); // taken before the work, so data that arrives meanwhile triggers the next calculation
  const { env: e, state } = countingEnv(env);
  const rows0 = state.rows;
  const val = await fn(e);
  await addBudget(env, state.rows - rows0, now);
  await putStored(env, key, { ver, val }, now);
  return val;
}
