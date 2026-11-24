/**
 * The automatic refresh of the saved Google data, every 4 hours (00, 04, 08, 12, 16 and 20 UTC), so nobody has to press anything.
 * The Worker's cron ticks once a minute and does one small job per tick (one invocation may make only 50 outgoing calls). From minute
 * 05 of those hours the ticks go: Analytics for a range, then that range's Search Console parts, then the next range.
 * Returns what this tick should refresh, or null.
 */
export const REFRESH_RANGES = ['28d', '7d', '3m'];
export const REFRESH_FIRST_MINUTE = 5;

export function refreshSlot(date, gscParts) {
  if (date.getUTCHours() % 4 !== 0) return null;
  const idx = date.getUTCMinutes() - REFRESH_FIRST_MINUTE;
  const per = 1 + gscParts; // one Analytics tick plus one tick per Search Console part
  if (idx < 0 || idx >= per * REFRESH_RANGES.length) return null;
  const id = REFRESH_RANGES[Math.floor(idx / per)];
  const within = idx % per;
  return within === 0 ? { kind: 'ga', id, part: 0 } : { kind: 'gsc', id, part: within - 1 };
}
