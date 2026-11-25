/**
 * Saved answers for the dashboard (table rcache). The free D1 plan allows 5M rows read a day, so the dashboard never asks the
 * database to compute on open: a Worker cron computes the standard answers every 4 hours and stores them here, and a screen with no
 * copy of its own reads the stored one (one row). A Refresh press recomputes. Not a Worker entry file, so it may export helpers.
 */
import { goals, insights, live, summary } from './lib.js';

const READY = new WeakSet();

export async function cacheTable(env) {
  if (READY.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rcache (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)').run();
  READY.add(env.DB);
}

/** One key for one question however the parameters were ordered or what else rode along (fresh, cached). */
export function cacheKey(name, search) {
  const q = new URLSearchParams(search);
  q.delete('fresh');
  q.delete('cached');
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

/**
 * What the dashboard asks for when it opens (all sites, 28 and 7 days), computed on a schedule so opening it never has to. Each job is one
 * cron tick (a Worker invocation may make only so many database calls), which is why they are a list and not one function.
 */
export const PRECOMPUTE_DAYS = [28, 7];
export const PRECOMPUTE_JOBS = [
  ...PRECOMPUTE_DAYS.flatMap((days) => [
    { name: '/v/summary', params: { days }, fn: summary },
    { name: '/v/summary', params: { days, who: 'all' }, fn: summary },
    { name: '/v/insights', params: { days }, fn: insights },
    { name: '/v/goals', params: { days }, fn: goals },
  ]),
  { name: '/v/live', params: {}, fn: live },
];

export async function precomputeJob(env, i) {
  const job = PRECOMPUTE_JOBS[i];
  if (!job) return null;
  const q = new URLSearchParams(Object.entries(job.params).map(([k, v]) => [k, String(v)]));
  const key = cacheKey(job.name, q.toString());
  await putStored(env, key, await job.fn(env, q));
  return key;
}
