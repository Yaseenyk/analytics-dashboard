"use client";

import { useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useGSC, useHealth } from "@/lib/data";
import { gscMerge } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { splitAll, isReal, priorityOf, PRIORITY_ORDER, type Priority, type PriorityInfo } from "@/lib/indexing";
import { inspectLink, plainState } from "@/lib/issues";
import { copyText, markSent, unmarkSent, useReview } from "@/lib/reviewStore";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

interface Row { url: string; host: string; state: string; crawled: string | null; pri: PriorityInfo; impr: number }
const PRI_STYLE: Record<Priority, string> = { high: "bg-bad/15 text-bad", medium: "bg-yellow-400/15 text-yellow-300", low: "bg-white/[.07] text-mute" };
const norm = (u: string) => u.replace(/\/+$/, "");
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const ago = (iso: string) => { const d = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white/[.07] px-4 text-[13.5px] font-semibold text-ink active:scale-[.98]";
const btnMain = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand/15 px-4 text-[13.5px] font-semibold text-brand active:scale-[.98]";

function useRows(site: string): Row[] | null {
  const h = useHealth().data;
  const f = useFilters();
  const gsc = useGSC(f.range).data;
  return useMemo(() => {
    if (!h) return null;
    const impr = new Map<string, number>();
    if (gsc) gscMerge(gsc, "all", "pages", 1).forEach((r) => impr.set(norm(String(r[0])), +r[2] || 0));
    const hosts = site === "all" ? SITE_HOSTS : [site];
    return hosts
      .flatMap((host) => (h.index?.[host]?.urls ?? []).filter((u) => isReal(u[1])).map(([url, state, crawled]) => {
        const n = impr.get(norm(url)) ?? 0;
        return { url, host, state, crawled, impr: n, pri: priorityOf(url, state, n) };
      }))
      .sort((a, b) => PRIORITY_ORDER[a.pri.level] - PRIORITY_ORDER[b.pri.level] || b.impr - a.impr);
  }, [h, gsc, site]);
}

/** Every page that is not in Google yet, by site, with a button to send each one. */
function Sheet({ site }: { site: string }) {
  const rows = useRows(site);
  const review = useReview();
  const [q, setQ] = useState("");
  const [pri, setPri] = useState<Priority | "all">("all");
  const [flash, setFlash] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (pri === "all" || r.pri.level === pri) && (!t || r.url.toLowerCase().includes(t) || r.state.toLowerCase().includes(t)));
  }, [rows, q, pri]);
  const count = (l: Priority) => (rows ?? []).filter((r) => r.pri.level === l).length;
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    shown.forEach((r) => m.set(r.host, [...(m.get(r.host) ?? []), r]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);

  if (!rows) return <p className="m-0 text-[15px] text-mute">Loading the list…</p>;
  if (!rows.length) return <p className="m-0 text-[15px] text-mute">Every page we check is in Google.</p>;

  const send = async (r: Row) => {
    const ok = await copyText(r.url);
    markSent(r.url, r.host);
    setFlash(ok ? `Link copied: ${path(r.url)}. Search Console is opening. Paste it into the box at the very top and press Enter.` : "Search Console is opening. Copy the page address by hand and paste it into the box at the very top.");
    window.open(inspectLink(r.url), "_blank", "noopener");
  };
  const copyAll = async () => {
    const ok = await copyText(shown.map((r) => r.url).join("\n"));
    setFlash(ok ? `Copied ${shown.length.toLocaleString("en-US")} links, one per line.` : "Could not copy. Select the links by hand.");
  };

  return (
    <div>
      <p className="m-0 text-[15px] leading-relaxed text-mute"><b className="text-[28px] text-ink">{rows.length.toLocaleString("en-US")}</b> {rows.length === 1 ? "page is" : "pages are"} not in Google yet. These are sitemap pages Google has looked at, or knows about, and has not added. New pages Google has not checked yet, and pages that say noindex on purpose, are left out.</p>
      <div className="mt-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these pages" aria-label="Search these pages" className="field min-h-11 min-w-0 flex-1 !rounded-xl" inputMode="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="button" className={btn} onClick={copyAll}>Copy all</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Priority">
        {(["all", "high", "medium", "low"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={pri === l} onClick={() => setPri(l)} className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold ${pri === l ? "bg-brand/15 text-brand" : "bg-white/[.07] text-mute"}`}>
            {l === "all" ? `All ${rows.length}` : `${l[0].toUpperCase()}${l.slice(1)} ${count(l)}`}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-[12px] leading-snug text-dim">High: people already search for it, it is a key page, or Google read it and said no. Medium: Google found it, has not crawled it. Low: translated copies, list pages, pages nobody asked for. Fix High first.</p>
      {q && <p className="m-0 mt-2 text-[12.5px] text-dim">{shown.length.toLocaleString("en-US")} match{shown.length === 1 ? "" : "es"}.</p>}
      {flash && <p role="status" className="m-0 mt-3 rounded-xl bg-brand/10 px-4 py-3 text-[13.5px] text-ink">{flash}</p>}

      <div className="mt-4 space-y-2.5">
        {groups.map(([host, list], i) => (
          <details key={host} open={!!q || i === 0} className="group rounded-2xl bg-white/[.04] [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
              <span className="text-[15px] font-semibold">{SITES[host] ?? host}</span>
              <span className="flex items-center gap-2 font-mono text-[12px] text-mute">{list.length}<Icon name="chevron" className="h-4 w-4 flex-none text-dim transition-transform duration-300 group-open:rotate-180" /></span>
            </summary>
            <ul className="m-0 list-none px-4 pb-2">
              {list.map((r) => {
                const sent = review[r.url];
                return (
                  <li key={r.url} className="border-t border-white/[.06] py-3.5">
                    <div className="flex items-start gap-2"><span className={`mt-0.5 flex-none rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${PRI_STYLE[r.pri.level]}`}>{r.pri.level}</span><a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 break-all font-mono text-[12.5px] text-ink" title={r.url}>{path(r.url)}</a></div>
                    <p className="m-0 mt-0.5 text-[12px] leading-snug text-dim">{r.pri.reason}. {plainState(r.state)}{r.crawled ? ` Last crawled ${r.crawled}.` : ""}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {sent ? (
                        <>
                          <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-good/10 px-4 text-[13.5px] font-semibold text-good"><Icon name="check" className="h-4 w-4" /> Sent {ago(sent.at)}</span>
                          <button type="button" className={btn} onClick={() => send(r)}>Open again</button>
                          <button type="button" className={btn} onClick={() => unmarkSent(r.url)}>Not sent</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={btnMain} onClick={() => send(r)}>Search Console <Icon name="open" className="h-4 w-4" /></button>
                          <button type="button" className={btn} onClick={async () => { const ok = await copyText(r.url); setFlash(ok ? `Link copied: ${path(r.url)}` : "Could not copy."); }}>Copy</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
      <p className="m-0 mt-4 text-[12.5px] leading-relaxed text-dim">This counts the pages in your sitemaps, so it can be shorter than Search Console&apos;s own list, which also includes addresses that are not in a sitemap. See &ldquo;Why the numbers differ&rdquo; on the To do screen.</p>
    </div>
  );
}

/** A full-width link under the four numbers on Home. Tap it to see every page that is not in Google yet. */
export default function NotIndexedLink() {
  const f = useFilters();
  const rows = useRows(f.site);
  const h = useHealth().data;
  const sp = h ? splitAll((f.site === "all" ? SITE_HOSTS : [f.site]).map((x) => h.index?.[x])) : null;
  const extra = sp ? [sp.waiting ? `${sp.waiting.toLocaleString("en-US")} new, not checked yet` : "", sp.onPurpose ? `${sp.onPurpose.toLocaleString("en-US")} noindex on purpose` : ""].filter(Boolean).join(" · ") : "";
  return (
    <PopBox id="not-indexed" title="Not indexed" radius={20} className="card flex w-full items-center gap-3 !border-transparent !p-4" label={`Not indexed: ${rows?.length ?? 0} pages`} render={() => <Sheet site={f.site} />}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/[.06] text-mute"><Icon name="health" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Not indexed</span>
        <span className="block text-[12.5px] text-dim">{rows ? (rows.length ? "Pages Google knows about but has not added." : "Every page Google has checked is in.") + (extra ? ` Not counted: ${extra}.` : "") : "Loading…"}</span>
      </span>
      <span className="text-[18px] font-semibold">{rows ? rows.length.toLocaleString("en-US") : "–"}</span>
      <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
    </PopBox>
  );
}
