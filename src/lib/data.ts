"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_API, gscProperty } from "./config";
import type { AlertItem, BingFile, CrawlFile, GAFile, GSCFile, HealthFile, HistoryRow, Live, Meta, OptimizerFile, RankFile, SpeedFile, ClarityFile } from "./types";

/**
 * One tiny store, one entry per data file. A block subscribes to just the file it needs, so when a slow
 * file arrives only the blocks that read it render again. Two copies of every file exist: the one GitHub
 * publishes every 2 hours (instant, from the CDN) and the live one from the Worker. The live copy replaces
 * the published one only when its numbers differ, so an unchanged answer never causes a render.
 */
export interface Entry<T> {
  data: T | null;
  error: boolean;
}
const EMPTY: Entry<never> = { data: null, error: false };

const store = new Map<string, Entry<unknown>>();
const subs = new Map<string, Set<() => void>>();
const inflight = new Set<string>();
/** Files that exist only on the Worker (kept in its KV), so they are fetched from it straight away. */
const LIVE_FIRST = new Set(["history.json", "alerts.json", "ranks.json", "crawl.json", "health.json"]);
/** GA4 and Search Console live in the Worker's database (KV). Opening a page reads the saved copy; only Refresh asks Google. */
const SNAP = /^(ga|gsc)-/;

function emit(key: string) {
  subs.get(key)?.forEach((f) => f());
}
function put(key: string, e: Entry<unknown>) {
  store.set(key, e);
  emit(key);
}
function sig(j: unknown) {
  try {
    return JSON.stringify(j, (k, v) => (k === "generatedAt" ? undefined : v));
  } catch {
    return String(Math.random());
  }
}

export const getApiBase = () => apiBase();
let api: string | null = null;
function apiBase(): string {
  if (api !== null) return api;
  api = DEFAULT_API;
  try {
    const q = new URLSearchParams(window.location.search).get("api");
    if (q === "off") api = "";
    else if (q) api = q;
  } catch {
    /* server render */
  }
  return api;
}

async function getJSON<T>(url: string, ms: number): Promise<T> {
  const c = typeof AbortController === "function" ? new AbortController() : null;
  const t = c ? setTimeout(() => c.abort(), ms) : 0;
  try {
    const r = await fetch(url, { signal: c?.signal, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } finally {
    if (t) clearTimeout(t);
  }
}

// ---- the "live" stamp in the header ------------------------------------------------
interface Stamp {
  liveAt: number;
  live: boolean;
  busy: boolean;
}
let stamp: Stamp = { liveAt: 0, live: false, busy: false };
const stampSubs = new Set<() => void>();
function setStamp(p: Partial<Stamp>) {
  stamp = { ...stamp, ...p };
  stampSubs.forEach((f) => f());
}
export function useStamp(): Stamp {
  return useSyncExternalStore(
    (cb) => {
      stampSubs.add(cb);
      return () => stampSubs.delete(cb);
    },
    () => stamp,
    () => stamp,
  );
}

/** Load the published copy (a static file, no API call). The live copy, which spends Google API calls, is fetched only when force is true, from the refresh button. */
/* What Refresh fetched live is kept in this browser, so reloading the page shows it instead of falling back to the copy
   published every 2 hours. The newer of the two (by generatedAt) wins; the saved copy expires after 12 hours. */
const CACHE_PREFIX = "live-cache:";
const cacheable = (file: string) => !/^(gsc|bing)-|^optimizer\.json$|^live\.json$/.test(file) && !LIVE_FIRST.has(file);
function readCache(file: string): { data: { generatedAt?: string }; at: number } | null {
  if (!cacheable(file)) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + file);
    if (!raw) return null;
    const c = JSON.parse(raw) as { at: number; data: { generatedAt?: string } };
    if (Date.now() - c.at > 12 * 3600e3) {
      localStorage.removeItem(CACHE_PREFIX + file);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}
function writeCache(file: string, data: unknown) {
  if (!cacheable(file)) return;
  const save = () => localStorage.setItem(CACHE_PREFIX + file, JSON.stringify({ at: Date.now(), data }));
  try {
    save();
  } catch {
    try {
      // storage is full: drop every saved live copy and try once more
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
      save();
    } catch {
      /* private window or too large: the page still works, it just forgets on reload */
    }
  }
}
const newer = (a?: { generatedAt?: string } | null, b?: { generatedAt?: string } | null) => !!a && String(a.generatedAt || "") > String((b as { generatedAt?: string } | null)?.generatedAt || "");

export function ensure(file: string, force = false, only?: string[], site?: string): Promise<void> {
  if (inflight.has(file) && !force) return Promise.resolve();
  inflight.add(file);
  const base = apiBase();
  const applyLive = (j: unknown) => {
    const cur = store.get(file);
    // Google sometimes answers a live GA4 request with nothing. Never swap numbers we already hold for an empty answer.
    if (/^ga-/.test(file)) {
      const has = (x: unknown) => ((x as GAFile | null)?.reports?.totals?.rows?.length ?? 0) > 0;
      if (cur?.data && has(cur.data) && !has(j)) return;
    }
    if (!cur?.data || sig(cur.data) !== sig(j)) put(file, { data: j, error: false });
    writeCache(file, j);
    if (!LIVE_FIRST.has(file)) setStamp({ liveAt: Date.now(), live: true });
  };
  // Bing numbers come only from the published copy. GA4 and Search Console come from the Worker's saved copy (no Google call);
  // Refresh asks Google through the Worker (Search Console in parts, because 13 properties x 8 reports exceed one invocation's
  // 50-call limit) and the Worker merges the answer into the saved copy.
  const staticOnly = /^bing-|^optimizer\.json$/.test(file);
  const snapped = !!base && SNAP.test(file);
  const holds = (x: unknown) => /^ga-/.test(file) ? ((x as GAFile | null)?.reports?.totals?.rows?.length ?? 0) > 0 : Object.values((x as GSCFile | null)?.search ?? {}).some((v) => (v as { ok?: boolean }).ok);
  const applySaved = (j: unknown) => {
    const cur = store.get(file);
    if (!holds(j) && !(j as { down?: string; idle?: boolean }).down) return;
    if (cur?.data && holds(cur.data) && !newer(j as { generatedAt?: string }, cur.data as { generatedAt?: string })) return;
    put(file, { data: j, error: false });
    const at = Date.parse(String((j as { generatedAt?: string }).generatedAt || ""));
    if (at && at > stamp.liveAt) setStamp({ liveAt: at });
  };
  // One quiet retry: a single dropped request (a deploy, a cold start) must not leave the screen at "Not saved yet".
  const fetchSaved = () => getJSON<unknown>(`${base}/data/${file}`, 20000).catch(() => new Promise<unknown>((r) => setTimeout(r, 1500)).then(() => getJSON<unknown>(`${base}/data/${file}`, 20000)));
  const saved = snapped && !force ? fetchSaved().then(applySaved, () => {}) : Promise.resolve();
  const refreshed = snapped && force ? refreshSaved(file, base, applyLive, only, site) : Promise.resolve();
  const live = base && !staticOnly && !SNAP.test(file) && (force || LIVE_FIRST.has(file) || file === "live.json") ? getJSON<unknown>(`${base}/data/${file}`, 45000).then(applyLive, () => {}) : Promise.resolve();
  const stat = (force && !staticOnly) || LIVE_FIRST.has(file)
    ? Promise.resolve()
    : getJSON<unknown>(`/data/${file}`, 30000).then(
        (j) => {
          const cur = store.get(file);
          const saved = readCache(file);
          const useSaved = !!saved && newer(saved.data, j as { generatedAt?: string });
          const use = useSaved ? saved!.data : j;
          if (!cur?.data || (force && sig(cur.data) !== sig(use))) put(file, { data: use, error: false });
          if (useSaved) setStamp({ liveAt: saved!.at, live: true }); // the header says when this copy was fetched
        },
        () => {
          const saved = readCache(file);
          if (saved && !store.get(file)?.data) {
            put(file, { data: saved.data, error: false });
            setStamp({ liveAt: saved.at, live: true });
          }
        },
      );
  return Promise.all([stat, live, saved, refreshed]).then(() => {
    inflight.delete(file);
    if (!store.get(file)?.data) put(file, { data: null, error: true });
  });
}

/** Refresh for GA4 or Search Console: the Worker asks Google and saves the answer. Search Console goes in parts of 5 properties. */
async function refreshSaved(file: string, base: string, apply: (j: unknown) => void, only?: string[], site?: string) {
  if (file.startsWith("ga-")) {
    const j = await getJSON<unknown>(`${base}/data/${file}?refresh=1${only?.length ? `&only=${only.join(",")}` : ""}${only?.length && site ? `&host=${encodeURIComponent(site)}` : ""}`, 70000).catch(() => null);
    if (j) apply(j);
    return;
  }
  if (site) {
    const j = await getJSON<unknown>(`${base}/data/${file}?refresh=1&site=${encodeURIComponent(gscProperty(site))}`, 70000).catch(() => null);
    if (j) apply(j);
    return;
  }
  for (let part = 0; part < 8; part++) {
    const j = await getJSON<{ done?: boolean }>(`${base}/data/${file}?refresh=1&part=${part}`, 70000).catch(() => null);
    if (!j) break;
    apply(j);
    if (j.done) break;
    await new Promise((r) => setTimeout(r, 1500)); // the next part reads what this one saved
  }
}

/** Ask Google (through the Worker) again for everything on screen. */
export interface Scope {
  /** GA4 reports this screen reads; only these are asked for. */
  ga?: string[];
  /** One site (host) for Search Console, or "all". */
  site?: string;
}
export function refreshAll(scope?: Scope) {
  const keys = [...subs.keys()].filter((k) => (subs.get(k)?.size ?? 0) > 0);
  setStamp({ busy: true });
  const done = () => setStamp({ busy: false });
  if (!keys.length) return done();
  let left = keys.length;
  keys.forEach((k) => {
    ensure(k, true, /^ga-/.test(k) ? scope?.ga : undefined, scope?.site && scope.site !== "all" ? scope.site : undefined);
    const t = setInterval(() => {
      if (!inflight.has(k)) {
        clearInterval(t);
        if (--left === 0) done();
      }
    }, 150);
  });
}

function useSource<T>(file: string | null): Entry<T> {
  useEffect(() => {
    if (file) ensure(file);
  }, [file]);
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!file) return () => {};
      let s = subs.get(file);
      if (!s) subs.set(file, (s = new Set()));
      s.add(cb);
      return () => {
        s!.delete(cb);
      };
    },
    [file],
  );
  return useSyncExternalStore(
    subscribe,
    () => (file ? ((store.get(file) as Entry<T> | undefined) ?? (EMPTY as Entry<T>)) : (EMPTY as Entry<T>)),
    () => EMPTY as Entry<T>,
  );
}

export const useMeta = () => useSource<Meta>("meta.json");
export const useGA = (range: string) => useSource<GAFile>(`ga-${range}.json`);
export const useGSC = (range: string) => useSource<GSCFile>(`gsc-${range}.json`);
export const useBing = (range: string) => useSource<BingFile>(`bing-${range}.json`);
export const useHealth = () => useSource<HealthFile>("health.json");
export const useLive = () => useSource<Live>("live.json");
export const useHistory = () => useSource<HistoryRow[]>("history.json");
export const useAlerts = () => useSource<AlertItem[]>("alerts.json");
export const useRanks = () => useSource<RankFile>("ranks.json");
export const useCrawl = () => useSource<CrawlFile>("crawl.json");
export const useSpeed = () => useSource<SpeedFile>("speed.json");
export const useOptimizer = () => useSource<OptimizerFile>("optimizer.json");
export const useClarity = () => useSource<ClarityFile>("clarity.json");
