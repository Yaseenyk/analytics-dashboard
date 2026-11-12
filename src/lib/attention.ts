import type { AlertItem, GAFile, GSCFile, HealthFile, Live } from "./types";
import { SITES, STREAMS, gscProperty } from "./config";
import { ix, rep } from "./derive";

/** Everything the Today screen says is computed here, from the same files the other screens read, so it can be tested. */
export type Level = "bad" | "warn" | "info" | "good";

export interface Attention {
  id: string;
  level: Level;
  title: string;
  detail?: string;
  /** Where the button goes, and what it says. */
  href?: string;
  cta?: string;
}

export interface SiteLine {
  host: string;
  name: string;
  people: number;
  peoplePrev: number;
  clicks: number;
  inGoogle: { indexed: number; inspected: number } | null;
  state: "growing" | "steady" | "quiet" | "new";
  /** One plain sentence about this site. */
  note: string;
}

export interface TodayModel {
  ready: boolean;
  tone: "good" | "calm" | "warn";
  /** The headline: "Looking good", "Quiet week", "A few things need a look". */
  headline: string;
  /** Two or three plain sentences. */
  sentences: string[];
  totals: { people: number; peoplePrev: number; visits: number; clicks: number; clicksPrev: number; leads: number; leadsPrev: number };
  sites: SiteLine[];
  items: Attention[];
}

export interface TodayInput {
  days: number;
  ga: GAFile | null | undefined;
  gsc: GSCFile | null | undefined;
  health: HealthFile | null | undefined;
  live: Live | null | undefined;
  alerts: AlertItem[] | null | undefined;
  /** Limit to one site (its host), or "all". */
  site: string;
  now?: number;
}

const num = (x: unknown) => +(x as number) || 0;
const pctChange = (cur: number, prev: number) => (prev > 0 ? Math.round((100 * (cur - prev)) / prev) : null);
const plural = (k: number, one: string, many = one + "s") => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;

/** Where an alert should send you, judged from its words. */
export function alertTarget(a: AlertItem): { href: string; cta: string } {
  const t = `${a.kind} ${a.title}`.toLowerCase();
  if (/workflow|job|run failed|deploy|build/.test(t)) return { href: "/jobs/", cta: "See the jobs" };
  if (/index|left google|not in google|dropped out/.test(t)) return { href: "/fix/", cta: "Send pages to Google" };
  if (/traffic|visit|drop|spike/.test(t)) return { href: "/traffic/", cta: "See traffic" };
  if (/broken|404|crawl|redirect|noindex|title/.test(t)) return { href: "/health/", cta: "See the checks" };
  return { href: "/health/", cta: "Take a look" };
}

function hostMetric(ga: GAFile | null | undefined, host: string, name: string, prev: boolean): number {
  const t = rep(ga, prev ? "totalsPrev" : "totals");
  const h = ix(t, "hostName");
  const mi = t.mets.indexOf(name);
  if (h < 0 || mi < 0) return 0;
  return t.rows.filter((r) => r[h] === host).reduce((s, r) => s + num(r[t.dims.length + mi]), 0);
}

export function buildToday(i: TodayInput): TodayModel {
  const hosts = i.site === "all" ? Object.keys(SITES) : [i.site];
  const ready = !!i.ga && rep(i.ga, "totals").rows.length > 0;
  const now = i.now ?? Date.now();
  // Without last period's report we cannot say anything grew, shrank or is new.
  const prevKnown = rep(i.ga, "totalsPrev").rows.length > 0;

  const sites: SiteLine[] = hosts.map((host) => {
    const people = hostMetric(i.ga, host, "activeUsers", false);
    const peoplePrev = hostMetric(i.ga, host, "activeUsers", true);
    const g = i.gsc?.search?.[gscProperty(host)];
    const clicks = g && g.ok && g.total ? num(g.total[0]) : 0;
    const hs = i.health?.index?.[host];
    const inGoogle = hs && hs.inspected > 0 ? { indexed: hs.indexed, inspected: hs.inspected } : null;
    const change = prevKnown ? pctChange(people, peoplePrev) : null;
    let state: SiteLine["state"] = "steady";
    if (people === 0 && peoplePrev === 0) state = "quiet";
    else if (prevKnown && peoplePrev === 0 && people > 0) state = "new";
    else if (change !== null && change >= 10 && people >= 5) state = "growing";
    else if (people < 3) state = "quiet";
    const name = SITES[host] ?? host;
    const g100 = inGoogle ? Math.round((100 * inGoogle.indexed) / inGoogle.inspected) : null;
    const note =
      state === "new" ? `First visitors this period (${people}).`
      : state === "growing" ? `${people} people, up ${change}%.`
      : state === "quiet" ? (people ? `Only ${plural(people, "person", "people")} visited.` : "No visitors yet.")
      : `${people} people${change !== null ? (change === 0 ? ", about the same" : change > 0 ? `, up ${change}%` : `, down ${Math.abs(change)}%`) : ""}.`;
    return { host, name, people, peoplePrev, clicks, inGoogle, state, note: g100 !== null && g100 < 100 ? `${note} ${g100}% of pages in Google.` : note };
  });

  const sum = (f: (s: SiteLine) => number) => sites.reduce((a, s) => a + f(s), 0);
  const totals = {
    people: sum((s) => s.people),
    peoplePrev: sum((s) => s.peoplePrev),
    visits: hosts.reduce((a, h) => a + hostMetric(i.ga, h, "sessions", false), 0),
    clicks: sum((s) => s.clicks),
    clicksPrev: hosts.reduce((a, h) => { const g = i.gsc?.search?.[gscProperty(h)]; return a + (g?.ok && g.totalPrev ? num(g.totalPrev[0]) : 0); }, 0),
    leads: hosts.reduce((a, h) => a + hostMetric(i.ga, h, "keyEvents", false), 0),
    leadsPrev: hosts.reduce((a, h) => a + hostMetric(i.ga, h, "keyEvents", true), 0),
  };

  const items: Attention[] = [];

  // 1. What the nightly check raised in the last 3 days. Alerts of one kind are merged into one card, so ten of them never become ten cards.
  const recent = (i.alerts ?? []).filter((a) => a.level !== "good" && now - Date.parse(a.at) < 3 * 864e5);
  const hostOf = (t: string) => { const m = /on (\S+)$/.exec(t); return m ? m[1] : ""; };
  const lead = (t: string) => { const m = /^(\d+)/.exec(t); return m ? +m[1] : 1; };
  const dropped = recent.filter((a) => a.kind === "dropped");
  if (dropped.length) {
    const total = dropped.reduce((a, x) => a + lead(x.title), 0);
    const names = [...new Set(dropped.map((x) => SITES[hostOf(x.title)] ?? hostOf(x.title)).filter(Boolean))];
    items.push({
      id: "dropped", level: "bad", title: `${plural(total, "page")} dropped out of Google`,
      detail: `${names.length ? `On ${names.join(", ")}. ` : ""}They were in Google and are gone now. Sending them again usually brings them back.`,
      href: "/fix/", cta: "Send them to Google again",
    });
  }
  const seen = new Set<string>();
  recent.filter((a) => a.kind !== "dropped").slice(0, 6).forEach((a) => {
    if (seen.has(a.title)) return;
    seen.add(a.title);
    const t = alertTarget(a);
    items.push({ id: `alert-${a.id}`, level: a.level === "bad" ? "bad" : "warn", title: a.title, detail: a.detail, href: t.href, cta: t.cta });
  });
  const fresh = (i.alerts ?? []).filter((a) => a.kind === "indexed" && now - Date.parse(a.at) < 3 * 864e5);
  if (fresh.length) {
    const total = fresh.reduce((a, x) => a + lead(x.title), 0);
    const names = [...new Set(fresh.map((x) => SITES[hostOf(x.title)] ?? hostOf(x.title)).filter(Boolean))];
    items.push({ id: "got-in", level: "good", title: `${plural(total, "new page")} got into Google`, detail: `Over the last 3 days${names.length ? `, on ${names.slice(0, 4).join(", ")}` : ""}. They can now show up in search.`, href: "/health/", cta: "See the checks" });
  }

  // 2. Pages Google does not have yet.
  const notIn = sites.map((s) => ({ s, k: i.health?.index?.[s.host]?.notIndexed ?? 0 })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k);
  const notInTotal = notIn.reduce((a, x) => a + x.k, 0);
  if (notInTotal > 0) {
    items.push({
      id: "not-in-google",
      level: notInTotal > 10 ? "warn" : "info",
      title: `${plural(notInTotal, "page")} not in Google yet`,
      detail: `Most on ${notIn.slice(0, 2).map((x) => `${x.s.name} (${x.k})`).join(" and ")}. A page that is not in Google cannot be found there.`,
      href: "/fix/",
      cta: "Send them to Google",
    });
  }

  // 3. A live count far out of line with the period total is almost always test or robot traffic.
  const liveBy: Record<string, number> = {};
  (i.live?.streams.rows ?? []).forEach((r) => { liveBy[String(r[0])] = (liveBy[String(r[0])] || 0) + num(r[1]); });
  sites.forEach((s) => {
    const stream = Object.keys(STREAMS).find((k) => STREAMS[k] === s.name);
    const lv = stream ? liveBy[stream] ?? 0 : 0;
    if (lv >= 20 && lv > Math.max(10, s.people)) {
      items.push({
        id: `odd-live-${s.host}`, level: "info",
        title: `${s.name} shows ${lv} people online, which looks too high`,
        detail: `Over the whole period only ${plural(s.people, "person", "people")} visited. This is usually test or robot traffic and clears within an hour.`,
      });
    }
  });

  // 4. Search Console missing for a site.
  const missing = sites.filter((s) => { const g = i.gsc?.search?.[gscProperty(s.host)]; return !!i.gsc && (!g || !g.ok); });
  if (missing.length) items.push({ id: "gsc-missing", level: "info", title: `Search Console is not connected for ${missing.map((m) => m.name).slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`, detail: "Google search numbers are missing for these sites.", href: "/help/", cta: "How to connect" });

  // 5. Good news.
  sites.filter((s) => s.state === "new").forEach((s) => items.push({ id: `new-${s.host}`, level: "good", title: `${s.name} got its first visitors`, detail: `${plural(s.people, "person", "people")} so far.`, href: "/traffic/", cta: "See where from" }));
  const cc = pctChange(totals.clicks, totals.clicksPrev);
  if (cc !== null && cc >= 25 && totals.clicks >= 5) items.push({ id: "clicks-up", level: "good", title: `Google clicks are up ${cc}%`, detail: `${plural(totals.clicks, "click")} from Google search this period.`, href: "/search/", cta: "See what people searched" });

  const order: Record<Level, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  items.sort((a, b) => order[a.level] - order[b.level]);

  // The words at the top.
  const pc = prevKnown ? pctChange(totals.people, totals.peoplePrev) : null;
  const problems = items.filter((x) => x.level === "bad" || x.level === "warn").length;
  const sentences: string[] = [];
  if (!ready) sentences.push("Waiting for the first visitor numbers. They appear about a day after a site starts counting.");
  else {
    sentences.push(
      pc === null ? `${plural(totals.people, "person", "people")} visited in the last ${i.days} days.`
      : pc >= 10 ? `More people came: ${totals.people.toLocaleString("en-US")} in the last ${i.days} days, up ${pc}%.`
      : pc <= -10 ? `Fewer people came: ${totals.people.toLocaleString("en-US")} in the last ${i.days} days, down ${Math.abs(pc)}%.`
      : `About the same as before: ${totals.people.toLocaleString("en-US")} people in the last ${i.days} days.`,
    );
    sentences.push(totals.clicks ? `Google sent ${plural(totals.clicks, "visitor")}${cc !== null ? ` (${cc >= 0 ? "up" : "down"} ${Math.abs(cc)}%)` : ""} from its search results.` : "Google has not sent visitors from search yet.");
  }
  sentences.push(problems ? `${plural(problems, "thing")} ${problems === 1 ? "needs" : "need"} a look.` : "Nothing is broken.");

  const tone: TodayModel["tone"] = problems ? "warn" : pc !== null && pc >= 10 ? "good" : "calm";
  const headline = !ready ? "Getting started" : problems ? (problems === 1 ? "One thing needs a look" : "A few things need a look") : pc !== null && pc >= 10 ? "Looking good" : pc !== null && pc <= -10 ? "A quieter period" : "All steady";
  return { ready, tone, headline, sentences, totals, sites, items: items.slice(0, 6) };
}
