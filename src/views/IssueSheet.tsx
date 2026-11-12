"use client";

import Link from "next/link";
import { useState } from "react";
import { inspectLink, type Issue } from "@/lib/issues";
import { copyText, markSent, unmarkSent, useReview } from "@/lib/reviewStore";
import { SITES } from "@/lib/config";
import { Icon } from "@/components/ui";

const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const ago = (iso: string) => { const d = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white/[.07] px-4 text-[13.5px] font-semibold text-ink active:scale-[.98]";
const btnMain = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand/15 px-4 text-[13.5px] font-semibold text-brand active:scale-[.98]";
const LEVEL: Record<Issue["level"], string> = { bad: "bg-bad", warn: "bg-yellow-400", info: "bg-brand", good: "bg-good" };

/** What an issue means and exactly what to do, with the pages behind it. Used in popups, on the To do list and on Home. */
export function IssueSheet({ issue }: { issue: Issue }) {
  const review = useReview();
  const [flash, setFlash] = useState("");
  const [all, setAll] = useState(false);
  const pages = all ? issue.pages : issue.pages.slice(0, 25);
  const sentCount = issue.pages.filter((p) => review[p.url]).length;

  const send = async (url: string, host: string) => {
    const ok = await copyText(url);
    markSent(url, host);
    setFlash(ok ? `Link copied: ${path(url)}. Search Console is opening. Paste the link into the box at the very top and press Enter.` : "Search Console is opening. Copy the page address by hand and paste it into the box at the very top.");
    window.open(inspectLink(url), "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <i className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full ${LEVEL[issue.level]}`} aria-hidden="true" />
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-dim">{issue.source}{issue.count ? ` · ${issue.count.toLocaleString("en-US")} ${issue.action === "none" && !issue.pages.length ? "" : "page" + (issue.count === 1 ? "" : "s")}` : ""}</div>
          <div className="text-[17px] font-bold leading-snug">{issue.title}</div>
        </div>
      </div>

      <section>
        <h3 className="m-0 text-[12.5px] font-semibold uppercase tracking-wider text-dim">What this means</h3>
        <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-ink">{issue.what}</p>
      </section>

      {issue.steps.length > 0 && (
        <section>
          <h3 className="m-0 text-[12.5px] font-semibold uppercase tracking-wider text-dim">What to do</h3>
          <ol className="m-0 mt-2 list-none space-y-2.5 p-0">
            {issue.steps.map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand/10 font-mono text-[12px] font-bold text-brand">{i + 1}</span>
                <p className="m-0 text-[14.5px] leading-relaxed text-mute">{t}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {issue.pages.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-[12.5px] font-semibold uppercase tracking-wider text-dim">Pages</h3>
            {issue.action === "inspect" && <span className="font-mono text-[11.5px] text-dim">{sentCount} of {issue.pages.length} sent</span>}
          </div>
          <ul className="m-0 mt-1 list-none p-0">
            {pages.map((p) => {
              const r = review[p.url];
              return (
                <li key={p.url} className="border-t border-white/[.06] py-4 first:border-t-0">
                  <a href={p.url} target="_blank" rel="noreferrer" className="break-all font-mono text-[12.5px] text-ink" title={p.url}>{path(p.url)}</a>
                  <p className="m-0 mt-0.5 text-[12px] text-dim">{SITES[p.host] ?? p.host}{p.note ? ` · ${p.note}` : ""}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {issue.action === "inspect" && (
                      r ? (
                        <>
                          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-good/10 px-3.5 text-[13.5px] font-semibold text-good"><Icon name="check" className="h-4 w-4" /> Sent {ago(r.at)}</span>
                          <button type="button" className={btn} onClick={() => send(p.url, p.host)}>Open again</button>
                          <button type="button" className={btn} onClick={() => unmarkSent(p.url)}>Not sent</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={btnMain} onClick={() => send(p.url, p.host)}>Open in Search Console <Icon name="open" className="h-4 w-4" /></button>
                          <button type="button" className={btn} onClick={async () => { const ok = await copyText(p.url); markSent(p.url, p.host); setFlash(ok ? `Link copied: ${path(p.url)}. Paste it into Search Console's top box.` : "Could not copy. Select the address by hand."); }}>Copy link</button>
                        </>
                      )
                    )}
                    {issue.action === "open" && <a href={p.url} target="_blank" rel="noreferrer" className={btnMain}>Open the page <Icon name="open" className="h-4 w-4" /></a>}
                  </div>
                </li>
              );
            })}
          </ul>
          {issue.pages.length > 25 && !all && <button type="button" className={`${btn} mt-2 w-full`} onClick={() => setAll(true)}>Show all {issue.pages.length}</button>}
        </section>
      )}

      {flash && <p role="status" className="m-0 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-[13.5px] text-ink">{flash}</p>}
      {issue.link && <Link href={issue.link.href} className={`${btnMain} w-full`}>{issue.link.label}</Link>}
    </div>
  );
}
