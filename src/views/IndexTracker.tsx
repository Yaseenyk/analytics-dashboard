"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useHealth } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { buildReview, type Review } from "@/lib/review";
import { Card } from "@/components/ui";

/* Where you are with each page, kept in this browser only (nobody else's clicks can change it):
   not in Google -> copy the link -> "Under review" -> Google indexes it -> "Indexed" with a tick. */
const KEY = "health-review-v1";

function load(): Review {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Review;
  } catch {
    return {};
  }
}
function save(r: Review) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private window: the page still works, it just forgets on reload */
  }
}
async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const a = document.createElement("textarea");
    a.value = t;
    a.style.position = "fixed";
    a.style.opacity = "0";
    document.body.appendChild(a);
    a.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    a.remove();
    return ok;
  }
}
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
const when = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

function Row({ url, status, right }: { url: string; status?: string; right: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-[12.5px] text-ink hover:text-brand" title={url}>
          {path(url)}
        </a>
        {status && <div className="text-[11.5px] text-dim">{status}</div>}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </li>
  );
}

const btn = "rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] font-semibold text-mute transition-colors hover:text-ink";

export function IndexTracker() {
  const f = useFilters();
  const h = useHealth().data;
  const [rev, setRev] = useState<Review>({});
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    setRev(load());
    setReady(true);
  }, []);
  const update = useCallback((fn: (r: Review) => Review) => {
    setRev((cur) => {
      const next = fn(cur);
      save(next);
      return next;
    });
  }, []);

  const view = useMemo(() => (h ? buildReview(h, f.site === "all" ? SITE_HOSTS : [f.site], rev) : null), [h, f.site, rev]);

  if (!view || !ready) return null;
  const total = view.notIn.reduce((a, x) => a + x.rows.length, 0);
  const copy = async (url: string, host: string) => {
    const ok = await copyText(url);
    setFlash(ok ? `Copied ${path(url)}. Paste it into Search Console's URL inspection, then Request indexing.` : "Could not copy: select the address and copy it by hand.");
    if (ok) update((r) => ({ ...r, [url]: { at: new Date().toISOString(), host } }));
  };

  return (
    <div className="space-y-4">
      {flash && (
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink">
          {flash}
        </p>
      )}

      <Card title={`Pages not in Google yet (${total})`} note="Open a site to see its pages. Copy a link, paste it into Search Console (URL inspection, then Request indexing). Once copied, the page moves to Under review.">
        {view.notIn.length === 0 || total === 0 ? (
          <p className="sub">Nothing waiting. Every inspected page is in Google, or is already under review.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {view.notIn
              .filter((x) => x.rows.length)
              .map((x) => (
                <details key={x.host} className="group rounded-xl border border-line bg-white/[.02] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                    <span className="text-[13.5px] font-semibold">{SITES[x.host]}</span>
                    <span className="flex items-center gap-2 font-mono text-[12px] text-mute">
                      {x.rows.length} not in Google
                      <span aria-hidden="true" className="text-dim transition-transform group-open:rotate-180">⌄</span>
                    </span>
                  </summary>
                  <ul className="px-4 pb-2">
                    {x.rows.map((u) => (
                      <Row
                        key={u[0]}
                        url={u[0]}
                        status={`${u[1]}${u[2] ? ` · last crawl ${u[2]}` : ""}`}
                        right={
                          <button type="button" className={btn} onClick={() => copy(u[0], x.host)}>
                            Copy link
                          </button>
                        }
                      />
                    ))}
                  </ul>
                </details>
              ))}
          </div>
        )}
      </Card>

      <Card title={`Under review (${view.under.length})`} note="Links you copied that Google has not indexed yet. This list is saved in this browser only. Google can take days to weeks, so the daily check will move a page to Indexed when it gets in.">
        {view.under.length === 0 ? (
          <p className="sub">Nothing under review yet.</p>
        ) : (
          <ul className="mt-2">
            {view.under.map((u) => (
              <Row
                key={u.url}
                url={u.url}
                status={`Copied ${when(u.at)} (${days(u.at)} d ago) · Google says: ${u.status}`}
                right={
                  <>
                    <button type="button" className={btn} onClick={() => copy(u.url, u.host)}>
                      Copy again
                    </button>
                    <button type="button" className={btn} onClick={() => update((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== u.url)))}>
                      Move back
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Indexed by Google (${view.done.length})`} note={view.hasIdx ? "Pages you requested that Google has now indexed." : "Shows after the next index check finishes (press Re-run above, or wait for tonight's run)."}>
        {view.done.length === 0 ? (
          <p className="sub">None yet.</p>
        ) : (
          <ul className="mt-2">
            {view.done.map((u) => (
              <Row
                key={u.url}
                url={u.url}
                status={`Requested ${when(u.at)}`}
                right={
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md bg-good/10 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-good" title="Google has indexed this page">
                      <span aria-hidden="true">✓</span> Indexed
                    </span>
                    <button type="button" className={btn} onClick={() => update((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== u.url)))}>
                      Clear
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
