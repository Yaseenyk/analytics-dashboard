"use client";

import { useState } from "react";
import { ensure, useGA, useGSC } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { GA_NEEDS, GSC_TABS } from "@/lib/sections";
import { Icon } from "@/components/ui";

const age = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function Chip({ name, saved, busy, onRefresh }: { name: string; saved: number | null; busy: boolean; onRefresh: () => void }) {
  return (
    <button type="button" onClick={onRefresh} disabled={busy} aria-label={`${name}: ${saved ? `saved ${age(saved)}` : "not saved yet"}. Tap to refresh only this.`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card2 pl-3 pr-2.5 text-[12px] font-medium text-mute active:scale-[.98] disabled:opacity-70">
      <span className="text-ink">{name}</span>
      <span className="text-dim">{busy ? "refreshing…" : saved ? `saved ${age(saved)}` : "not saved yet"}</span>
      <Icon name="refresh" className={`h-3.5 w-3.5 text-brand ${busy ? "animate-spin" : ""}`} />
    </button>
  );
}

/** One refresh button per source on this screen. Each asks Google only for what this screen shows and saves the answer. */
export default function SavedChips({ tab }: { tab: string }) {
  const f = useFilters();
  const needs = GA_NEEDS[tab];
  const wantsGsc = GSC_TABS.has(tab);
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
  const [busy, setBusy] = useState<"ga" | "gsc" | "">("");

  const gaAt = (() => {
    if (!needs || !ga || (ga as { idle?: boolean }).idle || ga.down) return null;
    const ts = needs.map((n) => { const r = ga.reports?.[n]; return Date.parse((f.site !== "all" ? r?.atHost?.[f.site] : undefined) ?? r?.at ?? ga.generatedAt); }).filter(Boolean);
    return ts.length ? Math.min(...ts) : null;
  })();
  const gscAt = gsc && Object.values(gsc.search ?? {}).some((v) => (v as { ok?: boolean }).ok) ? Date.parse(gsc.generatedAt) : null;

  const go = (which: "ga" | "gsc") => {
    setBusy(which);
    const p = which === "ga" ? ensure(`ga-${f.range}.json`, true, needs, f.site === "all" ? undefined : f.site) : ensure(`gsc-${f.range}.json`, true, undefined, f.site === "all" ? undefined : f.site);
    p.finally(() => setBusy(""));
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {needs && <Chip name="Google Analytics" saved={gaAt} busy={busy === "ga"} onRefresh={() => go("ga")} />}
      {wantsGsc && <Chip name="Search Console" saved={gscAt} busy={busy === "gsc"} onRefresh={() => go("gsc")} />}
      {f.site === "all" && <p className="m-0 w-full text-[12px] text-dim">All sites shows what is saved. Pick one site to refresh just that site, which asks Google for far less.</p>}
    </div>
  );
}
