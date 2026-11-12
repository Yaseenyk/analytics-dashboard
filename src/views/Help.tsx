"use client";

import { GLOSSARY } from "@/lib/glossary";
import { Card } from "@/components/ui";

const LINKS = [
  { label: "Search Console", href: "https://search.google.com/search-console", note: "Google's own report on your search results. Where you send pages to Google." },
  { label: "Google Analytics", href: "https://analytics.google.com/", note: "Counts the people who visit your sites." },
  { label: "Bing Webmaster Tools", href: "https://www.bing.com/webmasters", note: "Same idea as Search Console, for Bing." },
  { label: "Microsoft Clarity", href: "https://clarity.microsoft.com/", note: "Watch recordings of how visitors move on a page." },
];

const ORDER = ["people", "visits", "engaged", "leads", "online", "direct", "notset", "ai", "bots", "clicks", "impressions", "ctr", "position", "quickwin", "indexed", "notindexed", "crawl", "inspect", "sitemap", "compare", "utm", "rage", "scroll", "ga4", "gsc"];

export default function Help() {
  return (
    <>
      <Card title="Read it in 10 seconds">
        <ol className="m-0 mt-2 list-decimal space-y-2 pl-5 text-[14.5px] leading-relaxed text-mute marker:font-semibold marker:text-brand">
          <li>Open <b className="text-ink">Today</b>. The top box tells you if things are fine.</li>
          <li>Anything under <b className="text-ink">What needs you</b> has a button. Tap it to fix it.</li>
          <li>Green arrows ▲ mean better than the period before. Red ▼ means worse.</li>
          <li>Tap any <span className="border-b border-dotted border-dim text-ink">dotted word</span> or <span className="inline-grid h-4 w-4 place-items-center rounded-full border border-line2 align-middle text-[10px]">?</span> to see what it means.</li>
        </ol>
      </Card>

      <Card title="What the words mean" note="Tap a word to open it.">
        <ul className="mt-2">
          {ORDER.filter((k) => GLOSSARY[k]).map((k) => {
            const t = GLOSSARY[k];
            return (
              <li key={k} className="border-t border-line first:border-t-0">
                <details className="group [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-[15px] font-semibold">
                    {t.name}
                    <span aria-hidden="true" className="text-dim transition-transform duration-200 group-open:rotate-90">›</span>
                  </summary>
                  <div className="pb-3 text-[14px] leading-relaxed text-mute">
                    <p className="m-0">{t.plain}</p>
                    {t.good && <p className="m-0 mt-2"><b className="text-ink">Is this good? </b>{t.good}</p>}
                    {t.from && <p className="m-0 mt-2 font-mono text-[11.5px] text-dim">Comes from: {t.from}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="The Google tools, in one place" note="Where each number comes from. Each opens in a new tab.">
        <ul className="mt-2 space-y-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-line bg-white/[.02] p-3.5 active:bg-card2">
                <span className="font-semibold text-brand">{l.label} ↗</span>
                <span className="block text-[13px] text-mute">{l.note}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
