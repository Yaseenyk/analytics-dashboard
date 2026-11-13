"use client";

import Link from "next/link";
import { useMemo } from "react";
import { COLORS, SITES, SITE_HOSTS, STREAMS, gscProperty } from "@/lib/config";
import { useBing, useClarity, useGA, useGSC, useLive } from "@/lib/data";
import { bingTotals, group, gscTotals, hasGA, n, rep, sum } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { liveAge, peopleByHost } from "@/lib/today";
import { Icon } from "@/components/ui";

const LOOK: Record<string, [string, number]> = { "/sources/": ["audience", 0], "/search/": ["search", 3], "/bing/": ["search", 4], "/clarity/": ["live", 5], "/pages/": ["pages", 1], "/leads/": ["leads", 2], "/audience/": ["audience", 6], "/live/": ["live", 7] };

function Box({ href, title, tag, value, note }: { href: string; title: string; tag: string; value: string; note: string }) {
  const [icon, c] = LOOK[href] ?? ["pages", 0];
  const color = COLORS[c % COLORS.length];
  return (
    <Link href={href} className="card flex flex-col !border-transparent !p-4 active:bg-card2">
      <span className="flex items-center justify-between gap-2">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
      </span>
      <span className="mt-3 font-mono text-[10px] uppercase tracking-wider text-dim">{tag}</span>
      <span className="mt-0.5 text-[13.5px] font-semibold">{title}</span>
      <span className="mt-1.5 text-[24px] font-bold leading-tight tracking-tight">{value}</span>
      <span className="mt-0.5 text-[12px] leading-snug text-dim">{note}</span>
    </Link>
  );
}

/** One place for every kind of visitor number: Google Analytics, Search Console, Bing and Clarity, for all sites or one. */
export default function Visitors() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
  const bing = useBing(f.range).data;
  const clarity = useClarity().data;
  const live = useLive().data;
  const run = clarity?.runs[clarity.runs.length - 1];
  const hosts = f.site === "all" ? SITE_HOSTS : [f.site];

  const m = useMemo(() => {
    const ok = hasGA(ga);
    const t = rep(ga, "totals");
    const topPage = ok ? group(rep(ga, "pages"), [1], f.site)[0] : undefined;
    return {
      people: ok ? sum(t, "activeUsers", f.site) : null,
      visits: ok ? sum(t, "sessions", f.site) : null,
      leads: ok ? sum(t, "keyEvents", f.site) : null,
      topPage: topPage ? { path: topPage.k[0], views: topPage.m[0] } : null,
      gsc: gsc ? gscTotals(gsc, f.site, false) : null,
      bing: bing ? bingTotals(bing, f.site, false) : null,
      clarity: run ? hosts.reduce((a, h) => a + (run.sites[h]?.sessions ?? 0), 0) : null,
      online: live ? live.streams.rows.filter((r) => f.site === "all" || STREAMS[String(r[0])] === SITES[f.site]).reduce((a, r) => a + (+r[1] || 0), 0) : null,
    };
  }, [ga, gsc, bing, run, live, f.site, hosts]);
  const dash = (v: number | null) => (v === null ? "–" : n(v));
  const people = peopleByHost(ga);

  return (
    <>
      <div className="grid grid-cols-2 gap-3.5">
        <Box href="/sources/" tag="Google Analytics" title="People" value={dash(m.people)} note={m.visits === null ? "Where they came from" : `${n(m.visits)} visits. Tap for sources`} />
        <Box href="/search/" tag="Search Console" title="Google clicks" value={m.gsc ? n(m.gsc.clicks) : "–"} note={m.gsc ? `${n(m.gsc.impr)} times shown in Google` : "Searches and pages"} />
        <Box href="/bing/" tag="Bing" title="Bing clicks" value={m.bing ? n(m.bing.clicks) : "–"} note={m.bing ? `${n(m.bing.impr)} times shown in Bing` : "Searches and pages"} />
        <Box href="/clarity/" tag="Microsoft Clarity" title="Sessions watched" value={dash(m.clarity)} note="How people behave on the page" />
        <Box href="/pages/" tag="Google Analytics" title="Top page" value={m.topPage ? `${n(m.topPage.views)} views` : "–"} note={m.topPage ? m.topPage.path : "Most visited pages"} />
        <Box href="/leads/" tag="Google Analytics" title="Leads and clicks" value={dash(m.leads)} note="WhatsApp, email, phone, forms" />
        <Box href="/audience/" tag="Google Analytics" title="Countries" value="Map" note="Where visitors are, and how they behave" />
        <Box href="/live/" tag="Google Analytics" title="Online now" value={dash(m.online)} note={`People on the sites, ${liveAge(live?.generatedAt)}`} />
      </div>

      <section aria-labelledby="each-h">
        <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
          <h2 id="each-h" className="h2">Each site</h2>
          <span className="text-[12.5px] text-dim">All the numbers, side by side</span>
        </div>
        <ul className="m-0 list-none space-y-3 p-0">
          {hosts.map((h) => {
            const g = gsc?.search?.[gscProperty(h)];
            const bs = bing?.sites?.[h];
            const cl = run?.sites?.[h];
            const lv = live ? live.streams.rows.filter((r) => STREAMS[String(r[0])] === SITES[h]).reduce((a, r) => a + (+r[1] || 0), 0) : null;
            const cell = (k: string, v: string) => <div className="min-w-0"><small className="block text-[11px] text-dim">{k}</small><b className="text-[15px]">{v}</b></div>;
            return (
              <li key={h}>
                <button type="button" onClick={() => f.setSite(h)} className="card w-full !border-transparent text-left !p-4 active:bg-card2">
                  <div className="flex items-baseline justify-between gap-2"><h3 className="m-0 text-[15px] font-semibold">{SITES[h]}</h3><span className="truncate font-mono text-[11px] text-dim">{h}</span></div>
                  <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2.5">
                    {cell("People", ga && hasGA(ga) ? n(people[h] ?? 0) : "–")}
                    {cell("Google clicks", g?.ok && g.total ? n(g.total[0]) : "–")}
                    {cell("Bing clicks", bs?.ok && bs.total ? n(bs.total[0]) : "–")}
                    {cell("Clarity", cl?.sessions != null ? n(cl.sessions) : "–")}
                    {cell("Online", lv === null ? "–" : String(lv))}
                    {cell("Google position", g?.ok && g.total ? String(g.total[3]) : "–")}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {f.site !== "all" && <button type="button" onClick={() => f.setSite("all")} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-card2 px-4 text-[13.5px] font-semibold text-mute">Show all sites</button>}
      </section>
    </>
  );
}
