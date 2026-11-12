"use client";

import { useSyncExternalStore } from "react";
import type { Review } from "./review";

/** Pages you have sent to Search Console, kept in this browser only. A tiny shared store so every popup and list agrees at once. */
const KEY = "health-review-v1";
const EMPTY: Review = {};
let state: Review = {};
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") as Review; } catch { state = {}; }
}
function set(next: Review) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: it just forgets on reload */ }
  subs.forEach((f) => f());
}

export const markSent = (url: string, host: string) => { load(); set({ ...state, [url]: { at: new Date().toISOString(), host } }); };
export const unmarkSent = (url: string) => { load(); set(Object.fromEntries(Object.entries(state).filter(([k]) => k !== url))); };

export function useReview(): Review {
  return useSyncExternalStore(
    (cb) => { load(); subs.add(cb); return () => { subs.delete(cb); }; },
    () => { load(); return state; },
    () => EMPTY,
  );
}

export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const a = document.createElement("textarea");
    a.value = t; a.style.position = "fixed"; a.style.opacity = "0";
    document.body.appendChild(a); a.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    a.remove();
    return ok;
  }
}
