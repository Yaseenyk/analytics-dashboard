import { daily, ix, rep } from "./derive";
import type { GAFile } from "./types";

export interface DayRow { name: string; people: number; visits: number }
export interface TodayStats { date: string; rows: DayRow[]; people: number; visits: number }

/** The most recent day in the visitor report, by site. GA4 fills in a day gradually, so this is "so far" for today. */
export function todayBy(ga: GAFile | null | undefined, site: string): TodayStats | null {
  const d = rep(ga, "daily");
  if (!d.rows.length) return null;
  const vis = daily(d, "sessions", site);
  const usr = daily(d, "activeUsers", site);
  let date = "";
  vis.forEach((s) => s.pts.forEach((p) => { if (p[0] > date) date = p[0]; }));
  if (!date) return null;
  const at = (series: typeof vis, name: string) => series.find((s) => s.name === name)?.pts.find((p) => p[0] === date)?.[1] ?? 0;
  const rows = vis.map((s) => ({ name: s.name, visits: at(vis, s.name), people: at(usr, s.name) })).filter((r) => r.visits || r.people).sort((a, b) => b.visits - a.visits);
  return { date, rows, people: rows.reduce((a, r) => a + r.people, 0), visits: rows.reduce((a, r) => a + r.visits, 0) };
}

/** People per site over the whole period, by host. */
export function peopleByHost(ga: GAFile | null | undefined): Record<string, number> {
  const t = rep(ga, "totals");
  const h = ix(t, "hostName");
  const m = t.mets.indexOf("activeUsers");
  const out: Record<string, number> = {};
  if (h < 0 || m < 0) return out;
  t.rows.forEach((r) => { out[String(r[h])] = (out[String(r[h])] || 0) + (+r[t.dims.length + m] || 0); });
  return out;
}

/** One metric per host over the whole period (people, visits, key events...). */
export function metricByHost(ga: GAFile | null | undefined, name: string): Record<string, number> {
  const t = rep(ga, "totals");
  const h = ix(t, "hostName");
  const m = t.mets.indexOf(name);
  const out: Record<string, number> = {};
  if (h < 0 || m < 0) return out;
  t.rows.forEach((r) => { out[String(r[h])] = (out[String(r[h])] || 0) + (+r[t.dims.length + m] || 0); });
  return out;
}
