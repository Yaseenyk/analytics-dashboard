"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Our own visit tracker (the `pulse` Worker). Aggregates are public; one-by-one views need the key. */
export const PULSE_API = "https://pulse.yaseenyk.workers.dev";
const KEY_STORE = "pulse-key";

export type Status = "real" | "unclear" | "bot";
export const STATUS_LABEL: Record<Status, string> = { real: "Real people", unclear: "No interaction", bot: "Known bots" };
export const STATUS_ONE: Record<Status, string> = { real: "Real", unclear: "No interaction", bot: "Bot" };
export const STATUS_HELP: Record<Status, string> = {
  real: "A person scrolled, clicked, tapped or typed on the page.",
  unclear: "The page loaded and nothing human happened: a very quick bounce, or a robot that does not move.",
  bot: "A known robot, an automated browser, or a visit from a hosting network with no human action.",
};

export interface StatusRow { status: Status; hits: number; sessions: number; active: number | null; scroll: number | null }
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
  active: number; scroll: number; nclicks: number; ndl: number; nout: number; status: Status;
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

/** Fetch from pulse, optionally repeating. Skips the request while the tab is hidden, and while `enabled` is false. */
export function usePulse<T>(path: string, params: Params, opts: { key?: string; poll?: number; enabled?: boolean } = {}) {
  const { key, poll, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<"key" | "offline" | "server" | null>(null);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
    return p.toString();
  }, [params]);

  useEffect(() => {
    if (!enabled) { setData(null); return; }
    let dead = false;
    let timer = 0;
    const run = async () => {
      if (!document.hidden) {
        try {
          const r = await fetch(`${PULSE_API}${path}${qs ? `?${qs}` : ""}`, { cache: "no-store", headers: key ? { Authorization: `Bearer ${key}` } : undefined });
          if (dead) return;
          if (r.status === 401) setErr("key");
          else if (!r.ok) setErr("server");
          else { setData((await r.json()) as T); setErr(null); }
        } catch {
          if (!dead) setErr("offline");
        }
      }
      if (!dead && poll) timer = window.setTimeout(run, poll);
    };
    run();
    return () => { dead = true; window.clearTimeout(timer); };
  }, [path, qs, key, poll, enabled]);

  return { data, err };
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
  compare: { real: number; wins: number; bots: number; prevReal: number; prevWins: number; prevBots: number };
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
}
