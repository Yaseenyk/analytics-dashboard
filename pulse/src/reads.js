/**
 * NOT USED IN PRODUCTION: see the note at the top of agg.js (too much processing time for the free Workers plan).
 *
 * The dashboard's three heavy answers, the fast way: one read of the period, everything worked out in memory (agg.js). If that ever
 * throws, the old SQL version (lib.js) answers instead, so a bug in the new code cannot leave a screen empty. In dev mode only,
 * ?impl=sql asks for the old version, which is how the two are compared. Not a Worker entry file, so it may export helpers.
 */
import { goals as goalsSql, insights as insightsSql, istDay, pacificOffset, summary as summarySql } from './lib.js';
import { daysOf, goalsFrom, insightsFrom, loadInsightExtras, loadPeriod, siteParam, summaryFrom } from './agg.js';

const DAY = 864e5;

export async function summaryFast(env, q) {
  const now = Date.now();
  const period = await loadPeriod(env, now - daysOf(q) * DAY);
  return summaryFrom(period, q, now);
}

export async function insightsFast(env, q) {
  const now = Date.now();
  const days = daysOf(q);
  const period = await loadPeriod(env, now - 2 * days * DAY); // this period and the one before it
  const extras = await loadInsightExtras(env, siteParam(q), now - days * DAY, now);
  return insightsFrom(period, extras, q, now, pacificOffset(now), istDay);
}

export async function goalsFast(env, q) {
  const now = Date.now();
  const period = await loadPeriod(env, now - 2 * daysOf(q) * DAY);
  return goalsFrom(period, q, now);
}

/** Pick the fast version, fall back to SQL, and honour ?impl=sql only when dev mode says so. */
export function withFallback(fast, sql, dev) {
  return async (env, q) => {
    if (dev && q.get('impl') === 'sql') return sql(env, q);
    try { return await fast(env, q); } catch (e) {
      console.error('fast read failed, using SQL:', String((e && e.message) || e));
      return sql(env, q);
    }
  };
}

export const SQL = { summary: summarySql, insights: insightsSql, goals: goalsSql };
