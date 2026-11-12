"use client";

import { useMemo } from "react";
import { SITE_HOSTS } from "@/lib/config";
import { useAlerts, useCrawl, useHealth, useHistory } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { actionLine, actionTotals, buildIssues, type Issue } from "@/lib/issues";
import { useReview } from "@/lib/reviewStore";
import type { Series } from "@/lib/types";
import { AreaChart } from "@/components/charts";
import { PopBox } from "@/components/Pop";
import { Icon, SkCard, SkTable } from "@/components/ui";
import { SpeedCard } from "./HealthExtras";
import { SiteCards } from "./Health";
import { IssueSheet } from "./IssueSheet";

const NOT_COLOR = "#9aa0a6";
const IN_COLOR = "#0f9d58";

/** Search Console's "Validation" column, in our words: have you sent these pages yet? */
function Validation({ issue, sent }: { issue: Issue; sent: number }) {
  if (issue.action !== "inspect") return <span className="inline-flex items-center gap-1.5 text-[12.5px] text-mute"><i className={`h-2 w-2 rounded-full ${issue.level === "bad" ? "bg-bad" : issue.level === "warn" ? "bg-yellow-400" : "bg-dim"}`} aria-hidden="true" />{issue.level === "bad" ? "Needs fixing" : issue.level === "warn" ? "Needs a look" : "No action needed"}</span>;
  const [cls, text] = sent === 0 ? ["bg-bad", "Not started"] : sent < issue.count ? ["bg-yellow-400", `Started (${sent}/${issue.count})`] : ["bg-brand", "All sent"];
  return <span className="inline-flex items-center gap-1.5 text-[12.5px] text-mute"><i className={`h-2 w-2 rounded-full ${cls}`} aria-hidden="true" />{text}</span>;
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-1.5 mt-5 text-[12.5px] font-semibold uppercase tracking-wider text-dim first:mt-0">{children}</h3>;

/** Why this page and Search Console's "Pages" report show different totals, in plain words. */
function WhyDifferent({ indexed, not, at }: { indexed: number; not: number; at: string | null }) {
  return (
    <div className="text-[14.5px] leading-relaxed text-mute">
      <H>What each one counts</H>
      <p className="m-0"><b className="text-ink">This dashboard</b> checks only the pages in your sitemaps, the ones you want in Google. It asks Google about each one every night, so it is fresh. Right now: <b className="text-ink">{indexed.toLocaleString("en-US")} in Google</b> and <b className="text-ink">{not.toLocaleString("en-US")} not</b>{at ? ` (checked ${new Date(at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.</p>
      <p className="m-0 mt-2"><b className="text-ink">Search Console’s Pages report</b> counts every address Google has ever found, including ones that are not in your sitemap: old links that redirect, the same page with and without a slash at the end, test or tool pages. Its numbers are also refreshed only every few days.</p>
      <H>So you will usually see</H>
      <ul className="m-0 list-disc space-y-1.5 pl-5">
        <li><b className="text-ink">Indexed:</b> about the same here, sometimes a few higher, because this check is newer.</li>
        <li><b className="text-ink">Not indexed:</b> lower here. The extra ones in Search Console are mostly redirects and pages you never wanted in Google.</li>
      </ul>
      <H>Which should I trust?</H>
      <p className="m-0">For deciding what to fix, this list: it only shows pages you actually want in Google. Search Console is the official record of everything Google knows. Google does not let apps read that report, so the two cannot be forced to match exactly.</p>
      <a href="https://search.google.com/search-console/index" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-brand/15 text-[14px] font-semibold text-brand">Open Search Console’s Pages report <Icon name="open" className="h-4 w-4" /></a>
    </div>
  );
}

function Summary({ need }: { need: number }) {
  const f = useFilters();
  const h = useHealth().data;
  const hist = useHistory().data;
  const c = useMemo(() => {
    if (!h) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    let indexed = 0, not = 0;
    hosts.forEach((host) => { const s = h.index?.[host]; if (s) { indexed += s.indexed; not += s.notIndexed; } });
    const series: Series[] = [];
    if (hist?.length) {
      const pts = (fn: (x: [number, number]) => number) => hist.map((r) => [r.d, hosts.reduce((a, host) => a + (r.sites[host] ? fn(r.sites[host]) : 0), 0)] as [string, number]);
      series.push({ name: "Not indexed", color: NOT_COLOR, fmt: "n", pts: pts((x) => x[1] - x[0]) }, { name: "Indexed", color: IN_COLOR, fmt: "n", pts: pts((x) => x[0]) });
    }
    return { indexed, not, series, at: h.indexAt };
  }, [h, hist, f.site]);
  if (!c) return <SkCard className="space-y-3"><div className="h-24" /></SkCard>;
  const tile = (name: string, v: number, color: string, note: string) => (
    <div className="px-5 py-4" style={{ borderTop: `3px solid ${color}` }}>
      <div className="text-[12.5px] text-mute">{name}</div>
      <div className="mt-1 text-[28px] font-bold leading-tight tracking-tight">{v.toLocaleString("en-US")}</div>
      <div className="mt-0.5 text-[12px] text-dim">{note}</div>
    </div>
  );
  return (
    <div className="animate-fadein overflow-hidden rounded-3xl bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="h2">Page indexing</h2>
        <span className="font-mono text-[11.5px] text-dim">Checked {c.at ? new Date(c.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet"}</span>
      </div>
      <div className="mt-4 grid grid-cols-2">{tile("Not indexed", c.not, NOT_COLOR, need ? `${need.toLocaleString("en-US")} of them need action` : "none need action")}{tile("Indexed", c.indexed, IN_COLOR, "in Google now")}</div>
      <div className="px-5 pt-1">
        <PopBox id="why-diff" title="Why the numbers differ" radius={999} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card2 pl-3.5 pr-3 text-[13px] font-medium text-mute" render={() => <WhyDifferent indexed={c.indexed} not={c.not} at={c.at} />}>
          Counts your sitemap pages only. Why different from Search Console?
          <Icon name="chevron" className="h-4 w-4 -rotate-90 text-dim" />
        </PopBox>
      </div>
      {c.series.length ? <AreaChart bare title="Page indexing over time" series={c.series} empty="No history yet." /> : <p className="sub px-5 pb-5">The trend line appears after the nightly check has run for a few days.</p>}
    </div>
  );
}

function Row({ x, sent }: { x: Issue; sent: number }) {
  return (
    <li className="border-t border-white/[.06] first:border-t-0">
      <PopBox id={x.id} title={x.title} radius={0} className="flex w-full items-center gap-3 px-5 py-4 active:bg-white/[.04]" label={`${x.title}, ${x.count} pages`} render={() => <IssueSheet issue={x} />}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug">{x.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim"><span>{x.source}</span><Validation issue={x} sent={sent} /></span>
        </span>
        <span className="font-mono text-[16px] font-semibold">{x.count.toLocaleString("en-US")}</span>
        <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
      </PopBox>
    </li>
  );
}

export default function Todo() {
  const f = useFilters();
  const h = useHealth();
  const crawl = useCrawl().data;
  const alerts = useAlerts().data;
  const review = useReview();
  const issues = useMemo(() => buildIssues({ site: f.site, health: h.data, crawl, alerts }), [f.site, h.data, crawl, alerts]);
  const list = issues.filter((x) => x.level !== "good");
  const action = list.filter((x) => x.level === "bad" || x.level === "warn");
  const fine = list.filter((x) => x.level === "info");
  const t = actionTotals(issues);
  const sentOf = (x: Issue) => x.pages.filter((p) => review[p.url]).length;

  if (!h.data) return <><SkCard className="space-y-3"><div className="h-24" /></SkCard><SkTable rows={5} /></>;
  return (
    <>
      <Summary need={t.pages} />

      <section className="animate-fadein overflow-hidden rounded-3xl bg-card" aria-labelledby="act-h">
        <div className="px-5 pt-5">
          <h2 id="act-h" className="h2">Needs action</h2>
          <p className="sub">{t.groups ? `${actionLine(t)}, in ${t.groups} ${t.groups === 1 ? "group" : "groups"}. Tap a row to see exactly what to do.` : "Nothing needs action right now."}</p>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] border-y border-white/[.06] px-5 py-2 text-[11.5px] text-dim"><span>Reason</span><span>Pages</span></div>
        {action.length === 0 ? <p className="sub px-5 pb-5 pt-3">All clear.</p> : <ul className="m-0 list-none p-0">{action.map((x) => <Row key={x.id} x={x} sent={sentOf(x)} />)}</ul>}
      </section>

      {fine.length > 0 && (
        <section className="animate-fadein overflow-hidden rounded-3xl bg-card" aria-labelledby="fine-h">
          <div className="px-5 pt-5">
            <h2 id="fine-h" className="h2">No action needed</h2>
            <p className="sub">Google is not listing these, but that is expected or will fix itself. Tap one to see why.</p>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] border-y border-white/[.06] px-5 py-2 text-[11.5px] text-dim"><span>Reason</span><span>Pages</span></div>
          <ul className="m-0 list-none p-0">{fine.map((x) => <Row key={x.id} x={x} sent={sentOf(x)} />)}</ul>
        </section>
      )}

      <section aria-labelledby="each-h">
        <h2 id="each-h" className="h2 mb-3 px-1">Each site</h2>
        <SiteCards />
      </section>
      <SpeedCard />
      <p className="sub px-1">Sent pages are remembered on this phone only. Google decides when to add them, usually within days to weeks, and the nightly check ticks them off.</p>
    </>
  );
}
