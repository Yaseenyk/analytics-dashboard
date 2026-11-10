"use client";

import { COLORS } from "@/lib/config";
import { n, ndate, rep, sum } from "@/lib/derive";
import type { Cell, Rep } from "@/lib/types";
import { GaArea, GaKpi, GaTable, WaitingGate, cols2, grid4, useGaMemo } from "./kit";

const unset = (v: Cell | undefined) => !v || v === "(not set)" || v === "(not provided)" || v === "(none)";
const inr = (v: number) => "₹" + (+v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Rows that belong to a Google Ads campaign (GA4 puts every non-ad visit under "(not set)"). */
const adRows = (r: Rep, keyDim: string): Cell[][] => {
  const i = r.dims.indexOf(keyDim);
  return r.rows.filter((row) => !unset(row[i]));
};
const sumOf = (r: Rep, met: string) => sum(r, met, "all");

function Notice() {
  const { v } = useGaMemo((ga) => sumOf(rep(ga, "adsCampaigns"), "advertiserAdImpressions") + sumOf(rep(ga, "adsCampaigns"), "advertiserAdClicks") + sumOf(rep(ga, "adsCampaigns"), "advertiserAdCost"));
  if (v === null || v > 0) return null;
  return (
    <div className="card px-5 py-4">
      <h2 className="h2">Google Ads is connected, and no ad activity has been recorded yet</h2>
      <p className="sub mt-1 max-w-2xl">
        The Ads account was linked to Google Analytics on 10 Nov 2026. Spend, clicks and impressions appear here once a campaign has run and Google has finished processing it, which can take a day or more.
        Until then every number below is zero. Ad traffic also shows on the Sources tab as google / cpc.
      </p>
    </div>
  );
}

export default function Ads() {
  return (
    <WaitingGate>
      <Notice />
      <div className={grid4}>
        <GaKpi title="Spend" id="ads-spend" color={COLORS[0]} calc={(ga) => ({ value: inr(sumOf(rep(ga, "adsCampaigns"), "advertiserAdCost")), note: <span className="mt-1.5 block text-[11.5px] text-dim">All sites, in rupees</span> })} />
        <GaKpi title="Ad clicks" id="ads-clicks" color={COLORS[1]} calc={(ga) => ({ value: n(sumOf(rep(ga, "adsCampaigns"), "advertiserAdClicks")) })} />
        <GaKpi title="Impressions" id="ads-impr" color={COLORS[2]} calc={(ga) => ({ value: n(sumOf(rep(ga, "adsCampaigns"), "advertiserAdImpressions")) })} />
        <GaKpi
          title="Cost per click"
          id="ads-cpc"
          color={COLORS[3]}
          calc={(ga) => {
            const r = rep(ga, "adsCampaigns");
            const c = sumOf(r, "advertiserAdClicks");
            const imp = sumOf(r, "advertiserAdImpressions");
            return {
              value: c ? inr(sumOf(r, "advertiserAdCost") / c) : "–",
              note: <span className="mt-1.5 block text-[11.5px] text-dim">{imp ? `Click rate ${((c / imp) * 100).toFixed(2)}%` : "No impressions yet"}</span>,
            };
          }}
        />
      </div>

      <GaArea
        title="Ad spend per day (₹)"
        empty="No ad spend in this period."
        build={(ga) => {
          const r = rep(ga, "adsDaily");
          const di = r.dims.indexOf("date");
          const ci = r.mets.indexOf("advertiserAdCost");
          const by: Record<string, number> = {};
          r.rows.forEach((row) => {
            const d = ndate(row[di]);
            by[d] = (by[d] || 0) + (+row[r.dims.length + ci] || 0);
          });
          const pts = Object.keys(by).sort().map((d) => [d, Math.round(by[d] * 100) / 100] as [string, number]);
          return pts.some((p) => p[1] > 0) ? [{ name: "Spend", color: COLORS[0], pts }] : [];
        }}
      />

      <div className={cols2}>
        <GaTable
          title="Campaigns"
          cols={["Campaign", "Impressions", "Clicks", "Spend", "Visits", "Leads and clicks"]}
          fmt={[0, "n", "n", "inr", "n", "n"]}
          sort={3}
          note="Your Google Ads campaigns. Visits are the sessions Analytics counted from those ads."
          empty="No campaigns with activity in this period."
          build={(ga) => adRows(rep(ga, "adsCampaigns"), "sessionGoogleAdsCampaignName").map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]])}
        />
        <GaTable
          title="Keywords"
          cols={["Keyword", "Clicks", "Spend", "Visits", "Leads and clicks"]}
          fmt={[0, "n", "inr", "n", "n"]}
          sort={2}
          note="The search keyword each ad click came from."
          empty="No keyword data in this period."
          build={(ga) => adRows(rep(ga, "adsKeywords"), "sessionGoogleAdsKeyword").map((r) => [r[0], r[1], r[2], r[3], r[4]])}
        />
      </div>

      <GaTable
        title="Ad groups"
        cols={["Campaign", "Ad group", "Clicks", "Spend", "Visits"]}
        fmt={[0, 0, "n", "inr", "n"]}
        sort={3}
        empty="No ad groups with activity in this period."
        build={(ga) => adRows(rep(ga, "adsGroups"), "sessionGoogleAdsCampaignName").map((r) => [r[0], r[1], r[2], r[3], r[4]])}
      />
    </WaitingGate>
  );
}
