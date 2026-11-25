"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/** Our own visit tracker (the `pulse` Worker). Aggregates are public; one-by-one views need the key. */
export const PULSE_API = "https://pulse.yaseenyk.workers.dev";
const KEY_STORE = "pulse-key";

export type Status = "real" | "unclear" | "bot";
// "unclear" is a real person who did not interact: no interaction is not evidence of a bot (owner's decision, 24 Nov 2026).
export const STATUS_LABEL: Record<Status, string> = { real: "Real, interacted", unclear: "Real, no interaction", bot: "Known bots" };
export const STATUS_ONE: Record<Status, string> = { real: "Real", unclear: "Real · no interaction", bot: "Bot" };
export const STATUS_HELP: Record<Status, string> = {
  real: "A person scrolled, clicked, tapped or typed on the page.",
  unclear: "A visitor with no sign of being a bot who did not tap, scroll or type: they left quickly or only looked. Counted as a person.",
  bot: "A browser driven by software, or a robot name or server network with no human action on the page.",
};

/** Why a visit got its label. */
export type Why = "auto" | "acted" | "ua" | "host" | "left" | "stayed" | "idle";
export const WHY_LABEL: Record<Why, string> = {
  acted: "Touched, scrolled or typed",
  left: "Left within 2 seconds",
  stayed: "Stayed, never touched the page",
  idle: "Opened the page, did nothing",
  ua: "Its browser name says it is a robot",
  auto: "A browser driven by software",
  host: "From a server network, did nothing",
};

/** people = visitors (one per person per day), sessions = visits (browser tabs), hits = pages opened. */
export interface StatusRow { status: Status; people?: number; hits: number; sessions: number; active: number | null; scroll: number | null }
/** The headline count for a verdict: people, or pages for an answer saved before people were counted. */
export const peopleOf = (rows: StatusRow[] | undefined, s: Status) => { const r = rows?.find((x) => x.status === s); return r ? r.people ?? r.hits : 0; };
export interface Summary {
  generatedAt: string;
  days: number;
  site: string;
  who: "real" | "all";
  status: StatusRow[];
  bySite: { site: string; status: Status; n: number }[];
  kinds: { ref_kind: string; n: number }[];
  hosts: { ref_kind: string; ref_host: string; n: number }[];
  pages: { site: string; path: string; n: number; active: number | null; scroll: number | null }[];
  countries: { country: string; n: number }[];
  devices: { device: string; browser: string; n: number }[];
  daily: { day: string; status: Status; n: number }[];
  clicks: { site: string; kind: string; label: string; href: string; n: number; rage: number | null }[];
  signals: { dead: number | null; rage: number | null; total: number | null };
  actions: { site: string; path: string; kind: string; label: string; href: string; n: number; last: number }[];
  /** Who the bots are: one row per network and reason. */
  bots?: { org: string; why: Why; n: number; active: number | null; clicks: number | null }[];
  /** People who did nothing, split by how long the page stayed open. */
  idle?: { left: number; stayed: number };
  /** Visits from the owner's marked devices. They are in no other number. */
  mine?: { people: number; visits: number; hits: number };
}
export interface Live {
  generatedAt: string;
  windowSeconds: number;
  status: { status: Status; n: number }[];
  bySite: { site: string; status: Status; n: number }[];
  pages: { site: string; path: string; n: number }[];
}
export interface FeedRow {
  id: string; sid: string; site: string; path: string; ts: number; last: number; ref_host: string; ref_kind: string;
  country: string; device: string; browser: string; os: string; org: string; w: number; h: number;
  active: number; scroll: number; nclicks: number; ndl: number; nout: number; status: Status; why?: Why;
  /** One line is one visit: pages it opened, seconds on screen, and 1 when it is the owner's own. */
  pages?: number; seen?: number; me?: number;
}
export interface Journey {
  hits: { id: string; site: string; path: string; ts: number; last: number; ref_host: string; ref_kind: string; country: string; device: string; browser: string; os: string; active: number; scroll: number; status: Status }[];
  clicks: { hid: string; n: number; ts: number; kind: string; label: string; href: string; x: number; y: number; sec: string; z: number }[];
}
export interface ClickMap { visits: number; clicks: { kind: string; label: string; x: number; y: number; z: number }[] }

/** The saved key, kept only in this browser. */
export function useKey(): [string, (k: string) => void] {
  const [key, setK] = useState("");
  useEffect(() => {
    try { setK(localStorage.getItem(KEY_STORE) || ""); } catch { /* storage can be blocked */ }
  }, []);
  const set = useCallback((k: string) => {
    setK(k);
    try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
  }, []);
  return [key, set];
}

type Params = Record<string, string | number | undefined>;

// ---- visitor data: opening a screen makes NO request. It shows the last saved copy (kept in this browser); Refresh fetches ----
// Every open tab used to poll the tracker every 10 to 60 seconds and used most of the free 5M database rows read a day. Now a screen
// shows the copy saved in this browser the last time Refresh was pressed (components/PulseChip.tsx) and stays silent otherwise.
const CACHE = "pulse-cache:v1:";
type Saved<T> = { t: number; d: T };
function readSaved<T>(id: string): Saved<T> | null {
  try { const s = localStorage.getItem(CACHE + id); return s ? (JSON.parse(s) as Saved<T>) : null; } catch { return null; }
}
function writeSaved<T>(id: string, d: T, t = Date.now()) {
  const v = JSON.stringify({ t, d });
  try { localStorage.setItem(CACHE + id, v); } catch {
    try { // storage full: drop the old copies and keep this one
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(CACHE + id, v);
    } catch { /* storage is blocked; the numbers still show for this visit */ }
  }
}
let version = 0;
let updatedAt = 0;
const subs = new Set<() => void>();
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const notify = () => subs.forEach((f) => f());
/** Ask every visitor-data view on screen for fresh numbers (the Worker still protects the database from a flood of presses). */
export function refreshPulse() { version++; notify(); }
/** When the numbers on screen were fetched (the newest saved copy shown or fetched; 0 when nothing is saved yet). */
export function usePulseUpdated(): number { return useSyncExternalStore(sub, () => updatedAt, () => 0); }
const useVersion = () => useSyncExternalStore(sub, () => version, () => 0);

/** The answers the Worker computes by itself every 4 hours (and stores), so a screen with no copy of its own can open with numbers. */
const STORED_BY_WORKER = new Set(["/v/summary", "/v/insights", "/v/goals", "/v/live"]);
const FOUR_HOURS = 4 * 3600e3;

/**
 * Opening a screen shows the copy saved in this browser. When there is none (a first visit, a new browser or filter) or it is older than
 * 4 hours, it asks the Worker once for the answer the Worker stored on its own schedule (one stored row, nothing is computed). Refresh,
 * pressed while the view is open, asks for new numbers. Nothing else makes a request: no timers.
 *
 * firstLoad is for views the Worker cannot store ahead (they need the key, or a visit or page someone just picked, such as the one-by-one
 * list, a visit's steps, a page's click map, the leads inbox): with no copy, or one older than 4 hours, they load once when they open,
 * because opening them is itself the person asking. After that they wait for Refresh like the rest.
 */
export function usePulse<T>(path: string, params: Params, opts: { key?: string; enabled?: boolean; firstLoad?: boolean } = {}) {
  const { key, enabled = true, firstLoad = false } = opts;
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<"key" | "offline" | "server" | null>(null);
  const ver = useVersion();
  const handled = useRef(ver); // the Refresh presses already acted on; opening or re-filtering is not a press
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
    return p.toString();
  }, [params]);

  useEffect(() => {
    if (!enabled) { setData(null); return; }
    const id = `${path}${qs ? `?${qs}` : ""}`;
    const pressed = ver !== handled.current;
    handled.current = ver;
    const headers = key ? { Authorization: `Bearer ${key}` } : undefined;
    let dead = false;
    const show = (d: T, t: number) => { setData(d); setErr(null); if (t > updatedAt) { updatedAt = t; notify(); } };

    const load = (fresh: boolean) => {
      (async () => {
        try {
          const q = fresh ? `${qs}${qs ? "&" : ""}fresh=1` : qs;
          const r = await fetch(`${PULSE_API}${path}${q ? `?${q}` : ""}`, { cache: "no-store", headers });
          if (dead) return;
          if (r.status === 401) setErr("key");
          else if (!r.ok) setErr("server");
          else {
            const d = (await r.json()) as T;
            const t = Date.now();
            show(d, t); writeSaved(id, d, t);
          }
        } catch {
          if (!dead) setErr("offline");
        }
      })();
    };

    if (!pressed) {
      const c = readSaved<T>(id);
      if (c) show(c.d, c.t); else { setData(null); setErr(null); }
      if (c && Date.now() - c.t < FOUR_HOURS) return; // a copy under 4 hours old: stay silent
      if (!STORED_BY_WORKER.has(path)) { // nothing stored by the Worker for this one
        if (firstLoad) load(false);
        return () => { dead = true; };
      }
      (async () => {
        try {
          const r = await fetch(`${PULSE_API}${path}?${qs}${qs ? "&" : ""}cached=1`, { cache: "no-store", headers });
          if (dead || r.status !== 200) return; // 204: nothing stored yet
          const t = Number(r.headers.get("X-Cached-At")) || Date.now();
          if (c && t <= c.t) return;
          const d = (await r.json()) as T;
          if (dead) return;
          show(d, t); writeSaved(id, d, t);
        } catch { /* offline: the saved copy, if any, stays on screen */ }
      })();
      return () => { dead = true; };
    }

    load(true);
    return () => { dead = true; };
  }, [path, qs, key, enabled, ver]);

  return { data, err };
}

/** A keyed write to the tracker (marking a visit as the owner's own). True when it was accepted. */
export async function pulsePost(path: string, body: unknown, key: string): Promise<boolean> {
  try {
    const r = await fetch(`${PULSE_API}${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Days for the page's range choice. The tracker keeps 90 days, so longer ranges show 90. */
export const daysFor = (range: string) => ({ "7d": 7, "28d": 28, "3m": 90 } as Record<string, number>)[range] ?? 90;

export function regionName(code: string): string {
  if (!code) return "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
}

export interface Insights {
  generatedAt: string;
  days: number;
  site: string;
  compare: { real: number; wins: number; visits?: number; pages?: number; bots: number; prevReal: number; prevWins: number; prevBots: number };
  actedDaily: { day: string; n: number | null }[];
  sources: { ref_kind: string; ref_host: string; visits: number; wins: number | null; active: number | null }[];
  pages: { site: string; path: string; visits: number; entries: number | null; exits: number | null; wins: number | null; scroll: number | null; active: number | null; lcp: number | null }[];
  flows: { site: string; from_path: string; to_path: string; n: number }[];
  funnel: { sessions: number; multi: number | null; won: number | null };
  hours: { hour: number; dow: number; n: number }[];
  broken: { site: string; path: string; ref_host: string; n: number; last: number }[];
  errors: { site: string; path: string; errors: number; visits: number; last: number }[];
  speed: { site: string; path: string; n: number; lcp: number }[];
  alerts: { id: string; level: "good" | "warn" | "bad"; ts: number; site: string; title: string; detail: string }[];
  /** Where visitors struggle (added 24 Nov 2026; older visits have none of these). */
  health?: {
    /** hydration: a React recoverable hydration error; noise: it only happened on translated pages (React rebuilt the page). */
    errorMsgs: { site: string; path: string; msg: string; n: number; translated: number; last: number; hydration?: number; noise?: number }[];
    translated: { site: string; tl: string; visits: number; errored: number }[];
    deadSpots: { site: string; path: string; label: string; sec: string; n: number }[];
    slowTaps: { site: string; path: string; n: number; worst: number; avg: number }[];
    jumps: { site: string; path: string; n: number; cls: number }[];
    formsLeft: { site: string; path: string; form: string; left_unsent: number; sent: number }[];
    speedNet: { net: string; n: number; lcp: number }[];
  };
  /** Arrivals from Google per site and Pacific day (Search Console's day), and the first, partial day each site reported. */
  google?: { rows: { site: string; day: string; real: number; idle: number }[]; starts: { site: string; day: string }[] };
}

export type GoalKey = "whatsapp" | "email" | "phone" | "form" | "named" | "download" | "store" | "product" | "github";
/** /v/goals: the moments a real visitor became a lead or went on to a product, per site. */
export interface Goals {
  generatedAt: string;
  days: number;
  types: { goal: GoalKey; n: number; people: number; prevN: number; prevPeople: number }[];
  sites: { site: string; people: number; converters: number; goals: number; byGoal: Partial<Record<GoalKey, number>> }[];
  daily: { day: string; g: GoalKey; n: number }[];
  pages: { site: string; path: string; g: GoalKey; n: number }[];
  sources: { ref_kind: string; ref_host: string; people: number; n: number }[];
  recent: { site: string; path: string; g: GoalKey; label: string; href: string; ts: number }[];
}

/** /v/leads: every form sent on the sites (needs the key). */
export type LeadStatus = "new" | "replied" | "won" | "lost" | "spam";
export interface Lead {
  id: string; ts: number; site: string; form: string; name: string; email: string; phone: string; message: string;
  extra: Record<string, string>; path: string; landing: string; ref_host: string; ref_kind: string; utm_source: string; utm_campaign: string;
  country: string; status: LeadStatus; note: string; updated: number;
}
export interface LeadsFile {
  generatedAt: string; days: number; site: string; rows: Lead[];
  bySite: { site: string; n: number; won: number }[];
  byForm: { site: string; form: string; n: number }[];
  bySource: { ref_kind: string; ref_host: string; n: number; won: number }[];
  daily: { day: string; n: number }[];
  byStatus: { status: LeadStatus; n: number }[];
}
