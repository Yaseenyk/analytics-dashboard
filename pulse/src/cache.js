/**
 * Saved answers for the dashboard (table rcache). The free D1 plan allows 5M rows read a day, so an answer just computed is kept for a few
 * minutes and shared by every tab and Worker instance: a page load still calls the tracker, but only the first call in a window computes.
 * Not a Worker entry file, so it may export helpers.
 */
const READY = new WeakSet();

export async function cacheTable(env) {
  if (READY.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rcache (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)').run();
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
