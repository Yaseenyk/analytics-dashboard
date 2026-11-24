"use client";

import { useEffect, useState } from "react";
import { useGA, useGSC } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { GA_NEEDS, GSC_TABS } from "@/lib/sections";

const age = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
/** Green when fresh, amber when old, red when nothing is saved. Live visitors go stale in minutes, reports in hours. */
const dotOf = (saved: number | null, fastMs: number) => (!saved ? "bg-bad" : Date.now() - saved < fastMs ? "bg-good" : "bg-yellow-400");

/**
 * How old the saved Google data on this screen is. There is no button: the analytics Worker asks Google for it by itself every
 * 4 hours (Analytics and Search Console, for the 7-day, 28-day and 3-month views) and saves it, and opening this app only reads
 * that saved copy. Nothing here calls Google or the tracker's database.
 */
export default function SavedChips({ tab }: { tab: string }) {
  const f = useFilters();
  const needs = GA_NEEDS[tab];
  const wantsGsc = GSC_TABS.has(tab);
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
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

  const sources = [
    needs ? { k: "ga" as const, name: "Analytics", at: gaAt, fast: 5 * 3600e3 } : null,
    wantsGsc ? { k: "gsc" as const, name: "Search Console", at: gscAt, fast: 5 * 3600e3 } : null,
  ].filter(Boolean) as { k: "ga" | "gsc"; name: string; at: number | null; fast: number }[];
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
        <li className="text-[12px] text-dim">{oldest ? `· saved ${age(oldest)} · updates by itself every 4 hours` : "· not saved yet · the next 4-hour update adds it"}</li>
      </ul>
    </section>
  );
}
