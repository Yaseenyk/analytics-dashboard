"use client";

import { useMemo } from "react";
import { useHealth } from "@/lib/data";
import { group, n, pct, rep, sum } from "@/lib/derive";
import { Card, Kpi, SkCard, SkTable } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import type { Cell } from "@/lib/types";
import { GaDonut, GaKpi, GaTable, GscTable, WaitingGate, cols2, grid4 } from "./kit";

/** This tab is always the PM Surya Ghar guide, whatever site the filter above says. */
const HOST = "solar.streamerosai.com";
const PROPERTY = `https://${HOST}/`;

/** Site languages. English lives at the root; every other language sits under /<code>/. */
const LANGS: Record<string, string> = {
  en: "English", hi: "Hindi", bn: "Bengali", mr: "Marathi", te: "Telugu", ta: "Tamil", gu: "Gujarati",
  kn: "Kannada", ml: "Malayalam", pa: "Punjabi", or: "Odia", as: "Assamese", ur: "Urdu",
};
const GUIDES: Record<string, string> = {
  "": "Home",
  "pm-surya-ghar-subsidy": "Subsidy",
  "solar-system-cost-india-subsidy": "Cost",
  "pm-surya-ghar-scheme-details": "Scheme details",
  "pm-surya-ghar-apply": "How to apply",
  "pm-surya-ghar-subsidy-status": "Check status",
  "pm-surya-ghar-vendor-guide": "Choose a vendor",
  "rooftop-solar-technical-specifications-india": "Technical specifications",
  "rooftop-solar-net-metering-india": "Net metering",
  "pm-surya-ghar-loan-rooftop-solar": "Loan and financing",
  "pm-surya-ghar-housing-society-rwa": "Housing societies and RWAs",
  "solar-subsidy-calculator": "Calculator",
  privacy: "Privacy",
};

/** "/hi/pm-surya-ghar-apply/" gives { lang: "Hindi", guide: "How to apply" }. Accepts full URLs too. */
function parse(raw: string): { lang: string; guide: string } {
  let p = raw.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
  p = p.replace(/^\/+|\/+$/g, "");
  const parts = p.split("/").filter(Boolean);
  let code = "en";
  if (parts.length && parts[0].length === 2 && LANGS[parts[0]] && parts[0] !== "en") code = parts.shift() as string;
  const slug = parts.join("/");
  return { lang: LANGS[code], guide: GUIDES[slug] ?? (slug ? slug : "Home") };
}

const leadRows = (ga: Parameters<typeof rep>[0]) => group(rep(ga, "keyEventsByPage"), [2, 1], HOST).filter((g) => g.k[1] === "generate_lead");

function Kpis() {
  return (
    <div className={grid4}>
      <GaKpi title="Visits" id="solar-visits" calc={(ga) => ({ value: n(sum(rep(ga, "totals"), "sessions", HOST)) })} />
      <GaKpi title="Page views" id="solar-views" calc={(ga) => ({ value: n(sum(rep(ga, "totals"), "screenPageViews", HOST)) })} />
      <GaKpi
        title="Not in English"
        id="solar-nonen"
        calc={(ga) => {
          const rows = group(rep(ga, "pages"), [1], HOST);
          const total = rows.reduce((s, g) => s + g.m[0], 0);
          const other = rows.filter((g) => parse(g.k[0]).lang !== "English").reduce((s, g) => s + g.m[0], 0);
          return { value: `${pct(other, total).toFixed(0)}%`, note: `${n(other)} of ${n(total)} views` };
        }}
      />
      <GaKpi
        title="Leads from the form"
        id="solar-leads"
        calc={(ga) => ({ value: n(leadRows(ga).reduce((s, g) => s + g.m[0], 0)), note: "Second-opinion form submissions" })}
      />
    </div>
  );
}

function Languages() {
  return (
    <div className={cols2}>
      <GaDonut
        title="Views by language"
        empty="No views yet. They appear about a day after the tag goes live."
        build={(ga) => {
          const by: Record<string, number> = {};
          group(rep(ga, "pages"), [1], HOST).forEach((g) => (by[parse(g.k[0]).lang] = (by[parse(g.k[0]).lang] || 0) + g.m[0]));
          return Object.entries(by).sort((a, b) => b[1] - a[1]);
        }}
      />
      <GaTable
        title="Languages"
        cols={["Language", "Views", "People", "Leads"]}
        bar={1}
        fmt={[0, "n", "n", "n"]}
        max={13}
        note="Read from the page address (/hi/, /ta/ and so on). Leads are form submissions."
        build={(ga) => {
          const by: Record<string, number[]> = {};
          group(rep(ga, "pages"), [1], HOST).forEach((g) => {
            const l = parse(g.k[0]).lang;
            const a = (by[l] ||= [0, 0, 0]);
            a[0] += g.m[0];
            a[1] += g.m[1];
          });
          leadRows(ga).forEach((g) => {
            const l = parse(g.k[0]).lang;
            const a = (by[l] ||= [0, 0, 0]);
            a[2] += g.m[0];
          });
          return Object.entries(by).map(([l, a]) => [l, a[0], a[1], a[2]]);
        }}
      />
    </div>
  );
}

function Guides() {
  return (
    <div className={cols2}>
      <GaTable
        title="Guides: views and leads"
        cols={["Guide", "Views", "Non-English", "Leads"]}
        bar={1}
        fmt={[0, "n", "n", "n"]}
        max={13}
        note="All 13 languages of a guide are added together."
        build={(ga) => {
          const by: Record<string, number[]> = {};
          group(rep(ga, "pages"), [1], HOST).forEach((g) => {
            const { lang, guide } = parse(g.k[0]);
            const a = (by[guide] ||= [0, 0, 0]);
            a[0] += g.m[0];
            if (lang !== "English") a[1] += g.m[0];
          });
          leadRows(ga).forEach((g) => {
            const a = (by[parse(g.k[0]).guide] ||= [0, 0, 0]);
            a[2] += g.m[0];
          });
          return Object.entries(by).map(([k, a]) => [k, a[0], a[1], a[2]]);
        }}
      />
      <GaTable
        title="Where the leads came from"
        cols={["Guide", "Language", "Leads"]}
        bar={2}
        fmt={[0, 0, "n"]}
        max={12}
        empty="No leads from the solar form yet."
        note="The messages themselves are in the portfolio's private leads inbox (source: solar)."
        build={(ga) => leadRows(ga).map((g) => {
          const { lang, guide } = parse(g.k[0]);
          return [guide, lang, g.m[0]];
        })}
      />
    </div>
  );
}

function Search() {
  return (
    <div className={cols2}>
      <GscTable
        title="Search: guide and language"
        cols={["Guide", "Language", "Clicks", "Impressions", "Position"]}
        bar={2}
        fmt={[0, 0, "n", "n", "pos"]}
        max={15}
        empty="No Search Console data yet. Verify the property and add the dashboard's service account as a user."
        note="Every page of the site, grouped by guide and language. Position is the average, weighted by impressions."
        build={(g) => {
          const rows = (g.search?.[PROPERTY]?.pages ?? []) as Cell[][];
          const by = new Map<string, number[]>();
          rows.forEach((r) => {
            const { lang, guide } = parse(String(r[0]));
            const k = `${guide}\u0001${lang}`;
            const a = by.get(k) ?? [0, 0, 0];
            const imp = +r[2] || 0;
            a[0] += +r[1] || 0;
            a[1] += imp;
            a[2] += (+r[4] || 0) * imp;
            by.set(k, a);
          });
          return [...by].map(([k, a]) => {
            const [guide, lang] = k.split("\u0001");
            return [guide, lang, a[0], a[1], a[1] ? a[2] / a[1] : 0];
          });
        }}
      />
      <GscTable
        title="Search: language"
        cols={["Language", "Clicks", "Impressions", "Click rate"]}
        bar={1}
        fmt={[0, "n", "n", "p"]}
        max={13}
        empty="No Search Console data yet."
        build={(g) => {
          const rows = (g.search?.[PROPERTY]?.pages ?? []) as Cell[][];
          const by: Record<string, number[]> = {};
          rows.forEach((r) => {
            const l = parse(String(r[0])).lang;
            const a = (by[l] ||= [0, 0]);
            a[0] += +r[1] || 0;
            a[1] += +r[2] || 0;
          });
          return Object.entries(by).map(([l, a]) => [l, a[0], a[1], pct(a[0], a[1])]);
        }}
      />
    </div>
  );
}

function Index() {
  const e = useHealth();
  const h = e.data?.index?.[HOST];
  const calc = useMemo(() => {
    if (!h) return null;
    const byLang: Record<string, number> = {};
    h.urls.forEach((u) => {
      const l = parse(u[0]).lang;
      byLang[l] = (byLang[l] || 0) + 1;
    });
    return {
      pages: Object.entries(byLang).sort((a, b) => b[1] - a[1]) as Cell[][],
      states: Object.entries(h.byState).sort((a, b) => b[1] - a[1]) as Cell[][],
    };
  }, [h]);
  if (e.error && !e.data) return <Card title="Index status"><p className="sub">Index data is not available right now.</p></Card>;
  if (!h || !calc) return <div className={cols2}><SkCard className="h-40"><span /></SkCard><SkTable /></div>;
  return (
    <>
      <div className={grid4}>
        <Kpi title="Pages checked" id="solar-inspected" value={n(h.inspected)} />
        <Kpi title="In Google" id="solar-indexed" value={n(h.indexed)} note={`${pct(h.indexed, h.inspected).toFixed(0)}% of checked pages`} />
        <Kpi title="Not in Google yet" id="solar-notindexed" value={n(h.notIndexed)} />
      </div>
      <div className={cols2}>
        <DataTable title="What Google says about the guides" cols={["Status", "Pages"]} rows={calc.states} fmt={[0, "n"]} bar={1} max={8} empty="No inspection results for this site yet. They appear after the next index check." />
        <DataTable title="Not in Google yet, by language" cols={["Language", "Pages"]} rows={calc.pages} fmt={[0, "n"]} bar={1} max={13} empty="Every checked page is indexed." note="Request indexing in Search Console for the home page and the key guides first. 169 pages is a lot for a new site." />
      </div>
    </>
  );
}

export default function Solar() {
  return (
    <WaitingGate>
      <p className="sub">The PM Surya Ghar guide at solar.streamerosai.com, in 13 languages. This tab always shows this site, whatever the site filter says.</p>
      <Kpis />
      <Languages />
      <Guides />
      <Search />
      <Index />
    </WaitingGate>
  );
}
