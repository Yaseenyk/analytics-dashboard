"use client";

import { useEffect, useState } from "react";
import { ensure, useGA, useGSC, useLive } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { GA_NEEDS, GSC_TABS } from "@/lib/sections";
import { Icon } from "@/components/ui";

/** Screens that show the live visitor count (it comes from Google Analytics' realtime report). */
const LIVE_TABS = new Set(["home", "live"]);

const age = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
/** Green when fresh, amber when old, red when nothing is saved. Live visitors go stale in minutes, reports in hours. */
const dotOf = (saved: number | null, fastMs: number) => (!saved ? "bg-bad" : Date.now() - saved < fastMs ? "bg-good" : "bg-yellow-400");

/**
 * The one place to refresh data. One row per source this screen uses, each with its own Refresh button, so there is exactly
 * one button for each thing and nothing else on the screen refreshes. A refresh asks Google only for what this screen shows,
 * for the site you picked, and the answer is saved so it is still there next time.
 */
export default function SavedChips({ tab }: { tab: string }) {
  const f = useFilters();
  const needs = GA_NEEDS[tab];
  const wantsGsc = GSC_TABS.has(tab);
  const wantsLive = LIVE_TABS.has(tab);
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
  const live = useLive().data;
  const [busy, setBusy] = useState<"ga" | "gsc" | "live" | "">("");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const gaAt = (() => {
    if (!needs || !ga || (ga as { idle?: boolean }).idle || ga.down) {
      return null;
    }
    const ts = needs
      .map((n) => {
        const r = ga.reports?.[n];
        return Date.parse((f.site !== "all" ? r?.atHost?.[f.site] : undefined) ?? r?.at ?? ga.generatedAt);
      })
      .filter(Boolean);
    return ts.length ? Math.min(...ts) : null;
  })();
  const gscAt = gsc && Object.values(gsc.search ?? {}).some((v) => (v as { ok?: boolean }).ok) ? Date.parse(gsc.generatedAt) : null;
  const liveAt = live?.generatedAt ? Date.parse(live.generatedAt) : null;

  const go = (which: "ga" | "gsc" | "live") => {
    const site = f.site === "all" ? undefined : f.site;
    return which === "ga" ? ensure(`ga-${f.range}.json`, true, needs, site) : which === "gsc" ? ensure(`gsc-${f.range}.json`, true, undefined, site) : ensure("live.json", true);
  };
  const sources = [
    needs ? { k: "ga" as const, name: "Analytics", at: gaAt, fast: 6 * 3600e3 } : null,
    wantsGsc ? { k: "gsc" as const, name: "Search Console", at: gscAt, fast: 6 * 3600e3 } : null,
    wantsLive ? { k: "live" as const, name: "Live", at: liveAt, fast: 10 * 60e3 } : null,
  ].filter(Boolean) as { k: "ga" | "gsc" | "live"; name: string; at: number | null; fast: number }[];
  // One button refreshes everything this screen shows, one source after another (Google's quotas stay safe), for the picked site.
  const refreshAll = async () => {
    for (const x of sources) {
      setBusy(x.k);
      try { await go(x.k); } catch { /* the source shows its own state */ }
    }
    setBusy("");
  };

  if (!sources.length) {
    return null;
  }
  const oldest = sources.every((x) => x.at) ? Math.min(...sources.map((x) => x.at as number)) : null;
  return (
    <section aria-label="Data" className="mt-4 flex min-h-[44px] items-center gap-3 rounded-xl border border-line bg-card px-3 py-1.5">
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-wrap items-center gap-x-3 gap-y-1 p-0">
        {sources.map((x) => (
          <li key={x.k} className="flex items-center gap-1.5 text-[12px] text-mute" title={x.at ? `${x.name}: saved ${age(x.at)}` : `${x.name}: not saved yet`}>
            <i className={`h-2 w-2 flex-none rounded-full ${dotOf(x.at, x.fast)}`} aria-hidden="true" />{x.name}
          </li>
        ))}
        <li className="text-[12px] text-dim">{busy ? "Asking Google…" : oldest ? `· ${age(oldest)}` : "· not saved yet"}</li>
      </ul>
      <button
        type="button"
        onClick={refreshAll}
        disabled={!!busy}
        aria-label={`Refresh ${sources.map((x) => x.name).join(", ")}${f.site === "all" ? "" : ` for ${f.site}`}`}
        className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] font-medium text-mute hover:border-line2 hover:text-ink disabled:opacity-60"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Wait" : "Refresh"}
      </button>
    </section>
  );
}
