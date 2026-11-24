"use client";

import { useMemo } from "react";
import { useLinks } from "@/lib/data";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { STATE_TEXT, firstCompare, linkRows, linkTotals, lostLinks, newLinks, pathOf, safeHref, siteTop } from "@/lib/links";
import { Card, Empty, Sk, SkCard } from "@/components/ui";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const Bar = ({ v, max }: { v: number; max: number }) => (
  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
    <i className="block h-full rounded-full bg-brand" style={{ width: `${v ? Math.max(3, (100 * v) / max) : 0}%` }} />
  </span>
);
const Stat = ({ v, t }: { v: string; t: string }) => (
  <div className="min-w-0">
    <div className="text-[22px] font-semibold leading-none tracking-tight tabular-nums">{v}</div>
    <div className="mt-1 truncate text-[11.5px] text-dim">{t}</div>
  </div>
);

function BarList({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="min-w-0">
      <h3 className="text-[12.5px] font-semibold text-mute">{title}</h3>
      <ul className="m-0 mt-1 list-none p-0">
        {rows.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 border-b border-white/[.04] py-1.5 last:border-0">
            <span className="min-w-0"><span className="block truncate text-[13px]">{k}</span><Bar v={v} max={max} /></span>
            <span className="text-right font-mono text-[13px] tabular-nums">{n(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who links to the sites, from Bing Webmaster Tools: per-site table, then new and lost linking domains this week. */
export default function Links() {
  const f = useFilters();
  const e = useLinks();
  const d = e.data;
  const calc = useMemo(() => {
    const rows = linkRows(d, f.site);
    return { rows, t: linkTotals(rows), fresh: newLinks(d, f.site), lost: lostLinks(d, f.site), top: siteTop(d, f.site), first: firstCompare(d) };
  }, [d, f.site]);

  if (e.error && !d) return <Card title="Who links to you"><Empty msg="Link data is not published yet. It appears after the next daily build." /></Card>;
  if (!d) return <SkCard className="space-y-3"><Sk w={30} h={14} /><Sk w={100} h={28} /><Sk w={90} /><Sk w={80} /></SkCard>;

  const { rows, t, fresh, lost, top } = calc;
  const max = Math.max(1, ...rows.map((r) => r.domains));
  const since = d.since ? day(d.since) : null;
  const note = `From Bing Webmaster Tools, checked once a day${d.generatedAt ? ` (last ${day(d.generatedAt)})` : ""}. Bing sees fewer links than paid tools and only the ${d.limits?.topPages ?? 10} most linked pages per site are opened, so this is a floor, not the full list. Links between your own sites are left out of the domains.`;
  const waitNote = calc.first ? `The first comparison appears around ${day(calc.first)}, once there is a snapshot a week old.` : "The first comparison appears a week after the first daily check.";

  return (
    <>
      <Card title="Who links to you" extra={<span className="text-[12px] text-dim">Source: Bing</span>} note={note}>
        {d.error && <p className="sub text-amber-200/80">Last check: {d.error}</p>}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat v={n(t.domains)} t="Domains" />
          <Stat v={n(t.links)} t="Links" />
          <Stat v={t.compared ? `+${n(t.fresh)}` : "–"} t="New" />
          <Stat v={t.compared ? `−${n(t.lost)}` : "–"} t="Lost" />
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_48px_48px_40px] gap-x-2 border-b border-white/[.06] pb-1.5 text-[11.5px] text-dim">
          <span>Site · linking domains</span><span className="text-right">Domains</span><span className="text-right">Links</span><span className="text-right">New</span>
        </div>
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <li key={r.h}>
              <button type="button" onClick={() => f.setSite(r.h)} className="grid w-full grid-cols-[minmax(0,1fr)_48px_48px_40px] items-center gap-x-2 border-b border-white/[.04] py-2 text-left last:border-0 active:bg-white/[.04]">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{r.name}{r.partial ? <span className="text-dim" title="Bing had more pages than one daily run reads"> +</span> : null}</span>
                  {r.state === "ok" ? <Bar v={r.domains} max={max} /> : <span className="mt-0.5 block text-[11.5px] leading-snug text-dim" title={r.why}>{STATE_TEXT[r.state]}</span>}
                </span>
                <span className="text-right font-mono text-[13px] tabular-nums">{r.state === "ok" ? n(r.domains) : "–"}</span>
                <span className="text-right font-mono text-[13px] tabular-nums text-mute">{r.state === "ok" ? n(r.links) : "–"}</span>
                <span className={`text-right font-mono text-[13px] tabular-nums ${r.fresh ? "text-good" : "text-mute"}`}>{r.fresh === null ? "–" : r.fresh ? `+${r.fresh}` : "0"}</span>
              </button>
            </li>
          ))}
        </ul>
        {(top.domains.length > 0 || top.pages.length > 0) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {top.domains.length > 0 && <BarList title="Top linking domains" rows={top.domains} />}
            {top.pages.length > 0 && <BarList title="Most linked pages" rows={top.pages} />}
          </div>
        )}
      </Card>

      <Card title="New links this week" extra={since ? <span className="text-[12px] text-dim">since {since}</span> : undefined} note={since ? "Domains Bing found linking to you that were not in the snapshot from about a week ago." : waitNote}>
        {since && fresh.length === 0 && <Empty msg="No new linking domains this week." />}
        {fresh.length > 0 && (
          <ul className="m-0 mt-2 list-none p-0">
            {fresh.slice(0, 30).map((x) => {
              const href = safeHref(x.from);
              return (
                <li key={x.h + x.domain} className="border-b border-white/[.04] py-2 last:border-0">
                  <div className="flex min-w-0 items-baseline gap-1.5 text-[13.5px]">
                    {href ? <a className="truncate font-medium text-brand underline-offset-2 hover:underline" href={href} target="_blank" rel="noopener noreferrer nofollow">{x.domain} ↗</a> : <span className="truncate font-medium">{x.domain}</span>}
                    <span className="flex-none text-dim">→</span>
                    <span className="min-w-0 truncate text-mute">{x.to ? pathOf(x.to) : "–"}</span>
                  </div>
                  {f.site === "all" && <div className="mt-0.5 text-[11.5px] text-dim">{x.name}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Lost this week" extra={since ? <span className="text-[12px] text-dim">since {since}</span> : undefined} note={since ? "Domains in the snapshot from about a week ago that Bing no longer shows. A link can also drop out because Bing reads only the top pages, so check before acting." : waitNote}>
        {since && lost.length === 0 && <Empty msg="No linking domains lost this week." />}
        {lost.length > 0 && (
          <ul className="m-0 mt-2 list-none p-0">
            {lost.slice(0, 30).map((x) => (
              <li key={x.h + x.domain} className="flex min-w-0 items-baseline justify-between gap-2 border-b border-white/[.04] py-2 text-[13.5px] last:border-0">
                <span className="truncate text-bad">{x.domain}</span>
                {f.site === "all" && <span className="flex-none text-[11.5px] text-dim">{x.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
