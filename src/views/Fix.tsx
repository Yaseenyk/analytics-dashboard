"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useHealth } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { buildReview, type Review } from "@/lib/review";
import { Card, Icon } from "@/components/ui";
import { Term } from "@/components/Term";

/* The routine: a page is not in Google -> copy its link and open Search Console's URL inspection -> Request indexing ->
   it moves to "Waiting for Google" -> the daily check marks it "In Google". Progress is kept in this browser only. */
const KEY = "health-review-v1";
/** Search Console property that covers every subdomain of the sites. */
const PROPERTY = "sc-domain:streamerosai.com";
const DAILY_LIMIT = 10; // Google allows roughly this many "Request indexing" a day

const load = (): Review => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Review; } catch { return {}; } };
const save = (r: Review) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private window: it just forgets on reload */ } };

async function copyText(t: string): Promise<boolean> {
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

/** The Search Console page where you inspect one address. The address is passed in the link; the clipboard copy is the safety net. */
export const inspectLink = (url: string) => `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(PROPERTY)}&id=${encodeURIComponent(url)}`;

/** Google's own status words in everyday language. */
export function plainState(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("discovered")) return "Google knows it exists but has not read it yet.";
  if (t.includes("crawled")) return "Google read it and chose not to keep it for now.";
  if (t.includes("unknown")) return "Google has never seen this page.";
  if (t.includes("duplicate")) return "Google thinks it copies another page.";
  if (t.includes("noindex")) return "The page tells Google not to list it.";
  if (t.includes("redirect")) return "The page sends people somewhere else.";
  if (t.includes("404") || t.includes("not found")) return "The page does not exist (404).";
  return s;
}
const when = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const ago = (iso: string) => { const d = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

const btn = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3.5 text-[13.5px] font-semibold text-ink active:scale-[.98]";
const btnMain = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-brand/10 px-3.5 text-[13.5px] font-semibold text-brand active:scale-[.98]";

function Steps({ done }: { done: number }) {
  const steps: [string, string][] = [
    ["Pick a page below", "Tap “Open in Search Console” on a page. This also copies its link."],
    ["Let Search Console open", "It opens in a new tab. If Google asks you to sign in, use the same Google account as always."],
    ["Check the page is in the box", "The page should already be in the box at the very top (“Inspect any URL”). If it is empty, paste the link there and press Enter."],
    ["Press “Request indexing”", "Wait a few seconds for the result, then tap the REQUEST INDEXING button. If it already says “URL is on Google”, you are done."],
    ["Come back here", "The page moves to “Waiting for Google”. Google can take days or weeks to add it. The daily check will tick it off."],
  ];
  return (
    <Card title="How to send a page to Google" note={<>About a minute per page. Google lets you do around {DAILY_LIMIT} a day, so start at the top of the list.{done > 0 ? ` You have sent ${done} so far.` : ""}</>} help="inspect">
      <ol className="m-0 mt-3 list-none space-y-3 p-0">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand/10 font-mono text-[13px] font-bold text-brand">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold leading-snug">{t}</div>
              <p className="m-0 text-[13.5px] leading-relaxed text-mute">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-brand underline">
        Open Search Console home <Icon name="open" className="h-3.5 w-3.5" />
      </a>
    </Card>
  );
}

function Row({ url, status, children }: { url: string; status: string; children: React.ReactNode }) {
  return (
    <li className="border-t border-line py-3 first:border-t-0">
      <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-[12.5px] text-ink" title={url}>{path(url)}</a>
      <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-dim">{status}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

export default function Fix() {
  const f = useFilters();
  const h = useHealth().data;
  const [rev, setRev] = useState<Review>({});
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState("");
  useEffect(() => { setRev(load()); setReady(true); }, []);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 9000); return () => clearTimeout(t); }, [flash]);
  const update = useCallback((fn: (r: Review) => Review) => setRev((cur) => { const next = fn(cur); save(next); return next; }), []);
  const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
  const view = useMemo(() => (h ? buildReview(h, hosts, rev) : null), [h, f.site, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !view) return <Card title="Checking Google…"><p className="sub">Loading the list of pages.</p></Card>;
  const total = view.notIn.reduce((a, x) => a + x.rows.length, 0);

  const send = async (url: string, host: string) => {
    const ok = await copyText(url);
    update((r) => ({ ...r, [url]: { at: new Date().toISOString(), host } }));
    setFlash(ok ? `Link copied: ${path(url)}. If Search Console opens empty, paste it in the top box.` : "Search Console is opening. Copy the page address by hand if the box is empty.");
    window.open(inspectLink(url), "_blank", "noopener");
  };
  const copyOnly = async (url: string, host: string) => {
    const ok = await copyText(url);
    update((r) => ({ ...r, [url]: { at: new Date().toISOString(), host } }));
    setFlash(ok ? `Link copied: ${path(url)}. Paste it into Search Console's top box.` : "Could not copy. Select the address and copy it by hand.");
  };
  const back = (url: string) => update((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== url)));

  return (
    <>
      <Steps done={view.under.length + view.done.length} />
      {flash && <p role="status" className="fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 m-0 mx-auto max-w-xl rounded-xl border border-brand/40 bg-card px-4 py-3 text-[13.5px] text-ink shadow-2xl lg:bottom-6">{flash}</p>}

      <Card title={`Pages not in Google yet (${total})`} note={<>These pages are not in Google, so nobody can find them in search. Open a site to see its pages. <Term k="notindexed">What does this mean?</Term></>}>
        {total === 0 ? (
          <p className="sub">Nothing waiting. Every checked page is in Google or already sent.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {view.notIn.filter((x) => x.rows.length).map((x, i) => (
              <details key={x.host} open={i === 0} className="group rounded-xl border border-line bg-white/[.02] [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                  <span className="text-[14.5px] font-semibold">{SITES[x.host]}</span>
                  <span className="flex items-center gap-2 font-mono text-[12px] text-mute">{x.rows.length} to send<Icon name="chevron" className="h-4 w-4 flex-none text-dim transition-transform duration-300 group-open:rotate-180" /></span>
                </summary>
                <ul className="m-0 list-none px-4 pb-1">
                  {x.rows.map((u) => (
                    <Row key={u[0]} url={u[0]} status={plainState(u[1])}>
                      <button type="button" className={btnMain} onClick={() => send(u[0], x.host)}>Open in Search Console <Icon name="open" className="h-4 w-4" /></button>
                      <button type="button" className={btn} onClick={() => copyOnly(u[0], x.host)}>Copy link</button>
                    </Row>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Waiting for Google (${view.under.length})`} note="You already sent these. Google decides when to add them, usually within days to weeks. This list is saved on this phone only.">
        {view.under.length === 0 ? <p className="sub">Nothing waiting.</p> : (
          <ul className="m-0 mt-2 list-none p-0">
            {view.under.map((u) => (
              <Row key={u.url} url={u.url} status={`Sent ${when(u.at)} (${ago(u.at)}). ${plainState(u.status)}`}>
                <button type="button" className={btn} onClick={() => send(u.url, u.host)}>Open again</button>
                <button type="button" className={btn} onClick={() => back(u.url)}>Not sent after all</button>
              </Row>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Now in Google (${view.done.length})`} note={view.hasIdx ? "Pages you sent that Google has added." : "Shows after tonight's check."}>
        {view.done.length === 0 ? <p className="sub">None yet.</p> : (
          <ul className="m-0 mt-2 list-none p-0">
            {view.done.map((u) => (
              <Row key={u.url} url={u.url} status={`Sent ${when(u.at)}`}>
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-good/10 px-3.5 text-[13.5px] font-semibold text-good"><Icon name="check" className="h-4 w-4" /> In Google</span>
                <button type="button" className={btn} onClick={() => back(u.url)}>Clear</button>
              </Row>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
