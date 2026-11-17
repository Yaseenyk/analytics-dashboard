"use client";

import { useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useGSC, useHealth, useQueue } from "@/lib/data";
import { gscMerge } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { WAIT_DAYS, isReal, ledgerFlags, priorityOf, PRIORITY_ORDER, splitAll, type LedgerFlags, type Priority, type PriorityInfo } from "@/lib/indexing";
import { inspectLink, plainState } from "@/lib/issues";
import { copyText, markSent, unmarkSent, useReview } from "@/lib/reviewStore";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

interface Row { url: string; host: string; state: string; crawled: string | null; pri: PriorityInfo; impr: number; flags: LedgerFlags; firstSeen: string | null }
const PRI_STYLE: Record<Priority, string> = { high: "bg-bad/15 text-bad", medium: "bg-yellow-400/15 text-yellow-300", low: "bg-white/[.07] text-mute" };
const norm = (u: string) => u.replace(/\/+$/, "");
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const ago = (iso: string) => { const d = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : "–");
const btn = "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[.07] px-3 text-[12.5px] font-semibold text-ink active:scale-[.98]";
const btnMain = "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand/15 px-3 text-[12.5px] font-semibold text-brand active:scale-[.98]";
const th = "whitespace-nowrap border-b border-line px-3 py-2 text-left text-[11.5px] font-medium text-dim";
const td = "whitespace-nowrap px-3 py-2.5 text-[12.5px] text-mute";

/** Every real "not indexed" page, joined with the Worker's ledger (drops, first seen) and with what you already sent. */
function useRows(site: string): Row[] | null {
  const h = useHealth().data;
  const q = useQueue().data;
  const f = useFilters();
  const gsc = useGSC(f.range).data;
  const review = useReview();
  return useMemo(() => {
    if (!h) return null;
    const impr = new Map<string, number>();
    if (gsc) gscMerge(gsc, "all", "pages", 1).forEach((r) => impr.set(norm(String(r[0])), +r[2] || 0));
    const hosts = site === "all" ? SITE_HOSTS : [site];
    const order = (r: Row) => (r.flags.dropped ? -2 : r.flags.stillOut !== null ? -1 : PRIORITY_ORDER[r.pri.level]);
    return hosts
      .flatMap((host) => (h.index?.[host]?.urls ?? []).filter((u) => isReal(u[1])).map(([url, state, crawled]) => {
        const n = impr.get(norm(url)) ?? 0;
        const rec = q?.items?.[url];
        const flags = ledgerFlags(rec, review[url]?.at);
        let pri = priorityOf(url, state, n);
        if (flags.dropped) pri = { level: "high", reason: `Dropped out of Google on ${shortDate(flags.dropDate)}${flags.drops > 1 ? ` (${flags.drops} times)` : ""}` };
        else if (flags.stillOut !== null) pri = { level: "high", reason: `Sent ${flags.stillOut} days ago and still not in Google` };
        return { url, host, state, crawled, impr: n, pri, flags, firstSeen: rec?.firstSeen ?? null };
      }))
      .sort((a, b) => order(a) - order(b) || b.impr - a.impr);
  }, [h, q, gsc, site, review]);
}

/** Every page that is not in Google yet, in one scrolling table, with a button to send each one. */
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
  const dropped = (rows ?? []).filter((r) => r.flags.dropped).length;
  const again = (rows ?? []).filter((r) => r.flags.stillOut !== null).length;

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
      <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-dim">This list rebuilds itself after every daily Google check. A page that falls out of Google comes back to the top ({dropped} now), and so does a page you sent more than {WAIT_DAYS} days ago that is still out ({again} now). Google gives no way for a dashboard to press Request indexing, so each one still goes through Search Console.</p>
      <div className="mt-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these pages" aria-label="Search these pages" className="field min-h-11 min-w-0 flex-1 !rounded-xl" inputMode="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="button" className={btn} onClick={copyAll}>Copy all</button>
      </div>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Priority">
        {(["all", "high", "medium", "low"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={pri === l} onClick={() => setPri(l)} className={`min-h-9 shrink-0 rounded-lg px-3 text-[13px] font-semibold ${pri === l ? "bg-brand/15 text-brand" : "bg-white/[.07] text-mute"}`}>
            {l === "all" ? `All ${rows.length}` : `${l[0].toUpperCase()}${l.slice(1)} ${count(l)}`}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-[12px] leading-snug text-dim">High: dropped out of Google, sent and still out, people already search for it, a key page, or Google read it and said no. Medium: Google found it, has not crawled it. Low: translated copies, list pages, pages nobody asked for. Fix High first.</p>
      {q && <p className="m-0 mt-2 text-[12.5px] text-dim">{shown.length.toLocaleString("en-US")} match{shown.length === 1 ? "" : "es"}.</p>}
      {flash && <p role="status" className="m-0 mt-3 rounded-xl bg-brand/10 px-4 py-3 text-[13.5px] text-ink">{flash}</p>}

      <div className="mt-4 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr>
              {["Page", "Site", "Priority", "Why", "Google says", "Last crawled", "First seen", "Status", ""].map((x, i) => <th key={x + i} scope="col" className={`${th} ${i === 0 ? "sticky left-0 z-10 bg-card pl-0" : ""}`}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const sent = r.flags.sentIsStale ? undefined : review[r.url];
              return (
                <tr key={r.url} className="border-b border-line">
                  <td className="sticky left-0 z-10 max-w-[200px] bg-card py-2.5 pr-3 text-[12.5px]"><a href={r.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-ink" title={r.url}>{path(r.url)}</a></td>
                  <td className={td}>{SITES[r.host] ?? r.host}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${PRI_STYLE[r.pri.level]}`}>{r.pri.level}</span></td>
                  <td className={td}>{r.pri.reason}</td>
                  <td className={td}>{plainState(r.state)}</td>
                  <td className={td}>{r.crawled ?? "–"}</td>
                  <td className={td}>{shortDate(r.firstSeen)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">
                    {r.flags.dropped ? <span className="font-semibold text-bad">Dropped {shortDate(r.flags.dropDate)}</span> : sent ? <span className={r.flags.stillOut !== null ? "font-semibold text-yellow-300" : "text-good"}>Sent {ago(sent.at)}{r.flags.stillOut !== null ? ", still out" : ""}</span> : <span className="text-dim">Not sent</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex gap-2">
                      {sent && r.flags.stillOut === null ? (
                        <>
                          <button type="button" className={btn} onClick={() => send(r)}>Open again</button>
                          <button type="button" className={btn} onClick={() => unmarkSent(r.url)}>Not sent</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={btnMain} onClick={() => send(r)}>{sent ? "Send again" : "Search Console"} <Icon name="open" className="h-4 w-4" /></button>
                          <button type="button" className={btn} onClick={async () => { const ok = await copyText(r.url); setFlash(ok ? `Link copied: ${path(r.url)}` : "Could not copy."); }}>Copy</button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
  const dropN = rows ? rows.filter((r) => r.flags.dropped).length : 0;
  const extra = sp ? [sp.waiting ? `${sp.waiting.toLocaleString("en-US")} new, not checked yet` : "", sp.onPurpose ? `${sp.onPurpose.toLocaleString("en-US")} noindex on purpose` : ""].filter(Boolean).join(" · ") : "";
  return (
    <PopBox id="not-indexed" title="Not indexed" radius={20} className="card flex w-full items-center gap-3 !border-transparent !p-4" label={`Not indexed: ${rows?.length ?? 0} pages`} render={() => <Sheet site={f.site} />}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/[.06] text-mute"><Icon name="health" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Not indexed</span>
        <span className="block text-[12.5px] text-dim">{rows ? (dropN ? `${dropN} dropped out of Google. ` : "") + (rows.length ? "Pages Google knows about but has not added." : "Every page Google has checked is in.") + (extra ? ` Not counted: ${extra}.` : "") : "Loading…"}</span>
      </span>
      <span className="text-[18px] font-semibold">{rows ? rows.length.toLocaleString("en-US") : "–"}</span>
      <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
    </PopBox>
  );
}
