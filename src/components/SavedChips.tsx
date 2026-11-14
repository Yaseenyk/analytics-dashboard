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

function Row({ name, saved, busy, fastMs = 6 * 3600e3, onRefresh }: { name: string; saved: number | null; busy: boolean; fastMs?: number; onRefresh: () => void }) {
  return (
    <li className="flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-lg border border-line bg-card px-3 py-1.5 sm:w-auto sm:min-w-[250px]">
      <i className={`h-2 w-2 flex-none rounded-full ${dotOf(saved, fastMs)}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight">{name}</div>
        <div className="mt-0.5 text-[12px] leading-tight text-dim">{busy ? "Asking Google…" : saved ? `Saved ${age(saved)}` : "Not saved yet"}</div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        aria-label={`Refresh ${name}`}
        className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] font-medium text-mute hover:border-line2 hover:text-ink disabled:opacity-60"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Wait" : "Refresh"}
      </button>
    </li>
  );
}

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
    setBusy(which);
    const site = f.site === "all" ? undefined : f.site;
    const p =
      which === "ga" ? ensure(`ga-${f.range}.json`, true, needs, site) : which === "gsc" ? ensure(`gsc-${f.range}.json`, true, undefined, site) : ensure("live.json", true);
    p.finally(() => setBusy(""));
  };

  if (!needs && !wantsGsc && !wantsLive) {
    return null;
  }
  return (
    <section aria-label="Data" className="mt-4">
      <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap">
        {needs && <Row name="Google Analytics" saved={gaAt} busy={busy === "ga"} onRefresh={() => go("ga")} />}
        {wantsGsc && <Row name="Search Console" saved={gscAt} busy={busy === "gsc"} onRefresh={() => go("gsc")} />}
        {wantsLive && <Row name="Live visitors" fastMs={10 * 60e3} saved={liveAt} busy={busy === "live"} onRefresh={() => go("live")} />}
      </ul>
      {f.site === "all" && (needs || wantsGsc) && (
        <p className="m-0 mt-2 text-[12px] leading-snug text-dim">Tip: pick one site above to refresh just that site.</p>
      )}
    </section>
  );
}
