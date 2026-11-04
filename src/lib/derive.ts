import { SITES, SITE_COLOR, SITE_HOSTS, gscProperty } from "./config";
import type { Cell, GAFile, GSCFile, GscSite, Rep, Series } from "./types";

/* ---- formatting ------------------------------------------------------------------ */
export function n(x: unknown): string {
  const v = +(x as number) || 0;
  const a = Math.abs(v);
  return a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e4 ? (v / 1e3).toFixed(1) + "k" : Math.round(v).toLocaleString("en-US");
}
export const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
export function dur(s: number): string {
  const v = Math.round(s || 0);
  return v >= 60 ? Math.floor(v / 60) + "m " + (v % 60) + "s" : v + "s";
}
export const label = (h: string) => SITES[h] || h;
export function ndate(s: Cell): string {
  const t = String(s);
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : t;
}
export type Fmt = 0 | "n" | "p" | "dur" | "pos";
/** GA4's raw placeholders in plain words: "(not set)" is a missing tag, "(direct)" and "(none)" mean no source info. */
export function nice(v: string): string {
  return v
    .replace(/\(direct\) \/ \(none\)/g, "direct / no source info")
    .replace(/\(not set\)/g, "not tagged")
    .replace(/\(direct\)/g, "direct")
    .replace(/\(none\)/g, "none");
}
export function fmtCell(v: Cell, f?: Fmt): string {
  if (f === "n") return n(v);
  if (f === "p") return (+v).toFixed(1) + "%";
  if (f === "dur") return dur(+v);
  if (f === "pos") return (+v).toFixed(1);
  return nice(String(v ?? ""));
}

/* ---- GA4 reports ------------------------------------------------------------------ */
export const EMPTY_REP: Rep = { dims: [], mets: [], rows: [] };
export const rep = (ga: GAFile | null | undefined, name: string): Rep => ga?.reports?.[name] ?? EMPTY_REP;
export const hasGA = (ga: GAFile | null | undefined) => rep(ga, "totals").rows.length > 0;
const isReal = (h: Cell | undefined) => h === undefined || !!SITES[String(h)];
export const ix = (r: Rep, nm: string) => r.dims.indexOf(nm);

export function filtered(r: Rep, site: string): Cell[][] {
  const hi = r.dims.indexOf("hostName");
  return r.rows.filter((row) => hi < 0 || (site === "all" ? isReal(row[hi]) : row[hi] === site));
}
export interface Group {
  k: string[];
  m: number[];
}
export function group(r: Rep, idx: number[], site: string): Group[] {
  const rows = filtered(r, site);
  const nd0 = r.dims.length;
  const map: Record<string, Group> = {};
  const out: Group[] = [];
  rows.forEach((row) => {
    const k = idx.map((i) => String(row[i] ?? ""));
    const id = k.join("\u0001");
    let o = map[id];
    if (!o) {
      o = map[id] = { k, m: r.mets.map(() => 0) };
      out.push(o);
    }
    r.mets.forEach((_, j) => {
      o.m[j] += +row[nd0 + j] || 0;
    });
  });
  return out.sort((a, b) => b.m[0] - a.m[0]);
}
export function sum(r: Rep, met: string, site: string): number {
  const j = r.mets.indexOf(met);
  const nd0 = r.dims.length;
  if (j < 0) return 0;
  return filtered(r, site).reduce((s, row) => s + (+row[nd0 + j] || 0), 0);
}

/** Daily series, one per site (or one for the selected site). */
export function daily(r: Rep, met: string, site: string, extra?: (row: Cell[]) => boolean): Series[] {
  const hi = ix(r, "hostName");
  const d0 = ix(r, "date");
  const j = r.mets.indexOf(met);
  const nd0 = r.dims.length;
  const by: Record<string, Record<string, number>> = {};
  filtered(r, site).forEach((row) => {
    if (extra && !extra(row)) return;
    const k = site === "all" ? label(String(row[hi])) : label(site);
    const d = ndate(row[d0]);
    by[k] = by[k] || {};
    by[k][d] = (by[k][d] || 0) + (+row[nd0 + j] || 0);
  });
  return Object.keys(by).map((k) => ({
    name: k,
    color: SITE_COLOR[k],
    pts: Object.keys(by[k])
      .sort()
      .map((d) => [d, by[k][d]] as [string, number]),
  }));
}
export function dailyAll(r: Rep, met: string, site: string): [string, number][] {
  const m: Record<string, number> = {};
  daily(r, met, site).forEach((s) => s.pts.forEach((p) => (m[p[0]] = (m[p[0]] || 0) + p[1])));
  return Object.keys(m)
    .sort()
    .map((d) => [d, m[d]] as [string, number]);
}
export const dailyTotal = (r: Rep, met: string, site: string) => dailyAll(r, met, site).map((p) => p[1]);

/* ---- Search Console ----------------------------------------------------------------- */
export interface GscItem {
  host: string;
  s: GscSite;
}
export function gscList(g: GSCFile | null | undefined, site: string): GscItem[] {
  const s = g?.search ?? {};
  const hosts = site === "all" ? SITE_HOSTS : [site];
  const out: GscItem[] = [];
  hosts.forEach((h) => {
    const x = s[gscProperty(h)];
    if (x && x.ok) out.push({ host: h, s: x });
  });
  return out;
}
export function gscMissing(g: GSCFile | null | undefined, site: string): string[] {
  const s = g?.search ?? {};
  const hosts = site === "all" ? SITE_HOSTS : [site];
  return hosts.filter((h) => !(s[gscProperty(h)] && s[gscProperty(h)].ok));
}
export interface GscTotals {
  clicks: number;
  impr: number;
  ctr: number;
  pos: number;
}
export function gscTotals(g: GSCFile | null | undefined, site: string, prev: boolean): GscTotals {
  let c = 0;
  let i = 0;
  let pw = 0;
  gscList(g, site).forEach((x) => {
    const t = prev ? x.s.totalPrev : x.s.total;
    if (t) {
      c += t[0];
      i += t[1];
      pw += t[3] * t[1];
    }
  });
  return { clicks: c, impr: i, ctr: i ? (100 * c) / i : 0, pos: i ? pw / i : 0 };
}
/** Merge one dimension across sites: [...keys, clicks, impressions, ctr, position]. */
export function gscMerge(g: GSCFile | null | undefined, site: string, kind: string, nk: number): Cell[][] {
  const map: Record<string, { k: Cell[]; c: number; i: number; pw: number }> = {};
  const out: { k: Cell[]; c: number; i: number; pw: number }[] = [];
  gscList(g, site).forEach((x) => {
    ((x.s[kind] as Cell[][] | undefined) ?? []).forEach((r) => {
      const key = r.slice(0, nk).join("\u0001");
      let o = map[key];
      if (!o) {
        o = map[key] = { k: r.slice(0, nk), c: 0, i: 0, pw: 0 };
        out.push(o);
      }
      o.c += +r[nk];
      o.i += +r[nk + 1];
      o.pw += +r[nk + 3] * +r[nk + 1];
    });
  });
  return out
    .map((o) => [...o.k, o.c, o.i, o.i ? (100 * o.c) / o.i : 0, o.i ? o.pw / o.i : 0] as Cell[])
    .sort((a, b) => +b[nk] - +a[nk] || +b[nk + 1] - +a[nk + 1]);
}
export interface GscDay {
  d: string;
  clicks: number;
  impr: number;
  ctr: number;
  pos: number;
}
export function gscDaily(g: GSCFile | null | undefined, site: string): GscDay[] {
  const m: Record<string, { c: number; i: number; pw: number }> = {};
  gscList(g, site).forEach((x) =>
    ((x.s.daily as number[][] | undefined) ?? []).forEach((r) => {
      const k = String(r[0]);
      const o = (m[k] = m[k] || { c: 0, i: 0, pw: 0 });
      o.c += r[1];
      o.i += r[2];
      o.pw += r[4] * r[2];
    }),
  );
  return Object.keys(m)
    .sort()
    .map((d) => {
      const o = m[d];
      return { d, clicks: o.c, impr: o.i, ctr: o.i ? (100 * o.c) / o.i : 0, pos: o.i ? o.pw / o.i : 0 };
    });
}

/* ---- where visitors come from ---------------------------------------------------------- */
const AI_RE = /chatgpt|openai|perplexity|claude|anthropic|gemini|bard|copilot|phind|deepseek|grok|meta\.ai|poe\.com|mistral|kagi|you\.com/i;
const NAMES: [RegExp, string][] = [
  [/chatgpt|chat\.openai|openai/i, "ChatGPT"], [/perplexity/i, "Perplexity"], [/claude|anthropic/i, "Claude"], [/gemini|bard/i, "Gemini"],
  [/copilot/i, "Copilot"], [/deepseek/i, "DeepSeek"], [/grok/i, "Grok"], [/^google|google\./i, "Google"], [/^bing|bing\./i, "Bing"],
  [/duckduckgo/i, "DuckDuckGo"], [/yahoo/i, "Yahoo"], [/baidu/i, "Baidu"], [/yandex/i, "Yandex"], [/ecosia/i, "Ecosia"], [/brave/i, "Brave"],
  [/linkedin|lnkd\.in/i, "LinkedIn"], [/facebook|fb\.com|^fb$|^m\.facebook/i, "Facebook"], [/instagram/i, "Instagram"],
  [/^t\.co$|twitter|^x\.com/i, "X (Twitter)"], [/whatsapp/i, "WhatsApp"], [/telegram|^t\.me/i, "Telegram"], [/youtube|youtu\.be/i, "YouTube"],
  [/reddit/i, "Reddit"], [/quora/i, "Quora"], [/news\.ycombinator|hacker/i, "Hacker News"], [/github/i, "GitHub"], [/dev\.to/i, "DEV"],
  [/medium\.com/i, "Medium"], [/producthunt/i, "Product Hunt"], [/stackoverflow|stackexchange/i, "Stack Overflow"], [/discord/i, "Discord"],
  [/pinterest/i, "Pinterest"], [/hashnode/i, "Hashnode"], [/indiehackers/i, "Indie Hackers"],
];
export function classify(source: Cell, medium: Cell): { name: string; cat: string } {
  const s = String(source || "").toLowerCase();
  const m = String(medium || "").toLowerCase();
  let name: string | null = null;
  for (const [re, nm] of NAMES) {
    if (re.test(s)) {
      name = nm;
      break;
    }
  }
  let cat: string;
  if (s === "(direct)" || s === "direct") {
    name = "Direct / unknown";
    cat = "Direct";
  } else if (AI_RE.test(s)) cat = "AI assistants";
  else if (/^(Google|Bing|DuckDuckGo|Yahoo|Baidu|Yandex|Ecosia|Brave)$/.test(name || "")) cat = "Search engines";
  else if (/^(LinkedIn|Facebook|Instagram|X \(Twitter\)|WhatsApp|Telegram|YouTube|Pinterest|Discord)$/.test(name || "")) cat = "Social and messaging";
  else if (/^(Reddit|Quora|Hacker News|GitHub|DEV|Medium|Product Hunt|Stack Overflow|Hashnode|Indie Hackers)$/.test(name || "")) cat = "Communities and dev sites";
  else if (m === "organic") cat = "Search engines";
  else if (/social|share|^qr$/.test(m)) cat = "Social and messaging";
  else if (m === "community") cat = "Communities and dev sites";
  else if (/email|mail/.test(m) || /mail\.|outlook/.test(s)) cat = "Email";
  else cat = "Other websites";
  if (!name) name = s.replace(/^www\./, "") || "(not set)";
  return { name, cat };
}
export interface SourceRow {
  name: string;
  cat: string;
  sessions: number;
  users: number;
  key: number;
  newU: number;
  eng: number;
}
export function sourcesAgg(ga: GAFile | null | undefined, site: string): SourceRow[] {
  const r = rep(ga, "sourceMedium");
  const nd0 = r.dims.length;
  const map: Record<string, SourceRow> = {};
  const out: SourceRow[] = [];
  filtered(r, site).forEach((row) => {
    const c = classify(row[1], row[2]);
    const k = c.name + "|" + c.cat;
    let o = map[k];
    if (!o) {
      o = map[k] = { name: c.name, cat: c.cat, sessions: 0, users: 0, key: 0, newU: 0, eng: 0 };
      out.push(o);
    }
    o.sessions += +row[nd0];
    o.users += +row[nd0 + 1];
    o.key += +row[nd0 + 2];
    o.newU += +row[nd0 + 3];
    o.eng += +row[nd0 + 4];
  });
  return out.sort((a, b) => b.sessions - a.sessions);
}
