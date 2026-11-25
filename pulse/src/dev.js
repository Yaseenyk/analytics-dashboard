/**
 * Dev mode, for running the tracker on this computer (wrangler dev --local, with PULSE_DEV=1) so a problem can be reproduced and measured
 * without the key. It switches on only when PULSE_DEV is 1 AND the request really is to localhost, so the deployed Worker (which never
 * sets PULSE_DEV, and is not reached as localhost) behaves exactly as before. In dev mode every answer also says how many database rows
 * it read (X-Rows-Read) and how many queries it made (X-Queries), the two numbers the free D1 plan limits.
 */
export function devMode(req, env) {
  if (!env || String(env.PULSE_DEV) !== '1') return false;
  try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(req.url).hostname); } catch { return false; }
}

const WRAPPED = new WeakMap();

function counted(stmt, state) {
  const add = (r) => { state.rows += (r && r.meta && r.meta.rows_read) || 0; state.queries += 1; return r; };
  return {
    _st: stmt,
    bind: (...a) => counted(stmt.bind(...a), state),
    all: async () => add(await stmt.all()),
    run: async () => add(await stmt.run()),
    first: async (c) => { const r = await stmt.first(c); state.queries += 1; return r; },
    raw: async (o) => add({ results: await stmt.raw(o) }).results,
  };
}

/** The same environment with its database wrapped so the rows read can be counted. One wrapper per database, so per-instance memory still works. */
export function countingEnv(env) {
  let w = WRAPPED.get(env.DB);
  if (!w) {
    const state = { rows: 0, queries: 0 };
    const db = {
      prepare: (sql) => counted(env.DB.prepare(sql), state),
      batch: async (stmts) => { const rs = await env.DB.batch(stmts.map((s) => s._st || s)); rs.forEach((r) => { state.rows += (r && r.meta && r.meta.rows_read) || 0; state.queries += 1; }); return rs; },
    };
    w = { db, state };
    WRAPPED.set(env.DB, w);
  }
  return { env: { ...env, DB: w.db }, state: w.state };
}
