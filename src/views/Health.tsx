"use client";

import { useMemo } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useHealth } from "@/lib/data";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import type { Cell } from "@/lib/types";
import { DataTable } from "@/components/DataTable";
import { Card, ErrorCard, Sk, SkCard, SkTable } from "@/components/ui";
import { cols2 } from "./kit";
import { IndexTracker } from "./IndexTracker";

function Explainer() {
  return (
    <details className="group rounded-2xl border border-line bg-card/60 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-[13.5px] font-semibold text-mute group-open:text-ink">
        What do these statuses mean?
        <span aria-hidden="true" className="text-dim transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <dl className="grid gap-4 px-5 pb-5 text-[13px] leading-relaxed text-mute md:grid-cols-3">
        <div><dt className="font-semibold text-ink">Discovered, currently not indexed</dt><dd className="mt-1">Google knows the page exists (from the sitemap or a link) but has not visited it yet. It usually just needs time and links pointing at it.</dd></div>
        <div><dt className="font-semibold text-ink">Crawled, currently not indexed</dt><dd className="mt-1">Google read the page and chose not to keep it. Thin, repeated or low-value content is the usual cause. This one needs a better page, not more waiting.</dd></div>
        <div><dt className="font-semibold text-ink">URL is unknown to Google</dt><dd className="mt-1">Google has no record of the page yet. Request indexing in Search Console and make sure other pages link to it.</dd></div>
      </dl>
    </details>
  );
}

function SiteCards() {
  const f = useFilters();
  const e = useHealth();
  const h = e.data;
  if (e.error && !h) return <ErrorCard what="index health" />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SITE_HOSTS.map((host) => {
        const s = h?.index?.[host];
        const b = h?.bing?.[host];
        if (!h) return <SkCard key={host} className="space-y-3"><Sk w={40} h={14} /><Sk w={30} h={28} /><Sk h={8} /></SkCard>;
        const pct = s && s.inspected ? Math.round((100 * s.indexed) / s.inspected) : 0;
        return (
          <button key={host} type="button" onClick={() => f.setSite(host)} className="card animate-fadein text-left transition-colors hover:border-brand/35">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="m-0 text-[15px] font-semibold">{SITES[host]}</h3>
              <span className="font-mono text-[11.5px] text-dim">{host}</span>
            </div>
            {s ? (
              <>
                <div className="mt-3 text-[28px] font-bold leading-none tracking-tight">
                  {n(s.indexed)}<span className="text-[15px] font-medium text-dim"> of {n(s.inspected)} pages in Google</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.06]" role="img" aria-label={`${pct}% indexed`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-brand to-purple" style={{ width: `${Math.max(pct, s.indexed ? 3 : 0)}%` }} />
                </div>
                <div className="mt-2 font-mono text-[12px] text-mute">{pct}% indexed · {n(s.notIndexed)} not yet</div>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-dim">Not checked yet. The next daily run adds it.</p>
            )}
            <div className="mt-3 border-t border-line pt-3 font-mono text-[12px] text-mute">
              {b ? <>Bing: {n(b.inIndex)} in index · {n(b.crawled)} crawled · {n(b.errors)} errors</> : "Bing: no crawl data yet"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Tables() {
  const f = useFilters();
  const e = useHealth();
  const h = e.data;
  const calc = useMemo(() => {
    if (!h) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const states: Record<string, number> = {};
    hosts.forEach((host) => {
      const s = h.index?.[host];
      if (!s) return;
      Object.entries(s.byState).forEach(([k, v]) => (states[k] = (states[k] || 0) + v));
    });
    return { states: Object.entries(states).sort((a, b) => b[1] - a[1]) as Cell[][], checked: h.indexAt };
  }, [h, f.site]);

  if (!calc) return <div className={cols2}><SkTable /><SkTable /></div>;
  return (
    <>
      <div className={cols2}>
        <DataTable title="What Google says about your pages" cols={["Status", "Pages"]} rows={calc.states} fmt={[0, "n"]} bar={1} max={12} empty="No inspection results yet. They appear after the first daily run." />
      </div>
      <p className="sub">
        Checked {calc.checked ? new Date(calc.checked).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet"}. This uses Google&apos;s URL Inspection data, so it can lag what you see in Search Console by a day.
      </p>
    </>
  );
}

export default function Health() {
  return (
    <>
      <Explainer />
      <SiteCards />
      <Tables />
      <IndexTracker />
    </>
  );
}
