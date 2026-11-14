"use client";

import { useMemo } from "react";
import { SITE_HOSTS } from "@/lib/config";
import { useCrawl, useGSC, useHealth } from "@/lib/data";
import { gscMerge } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import type { Cell } from "@/lib/types";
import { DataTable } from "@/components/DataTable";
import { SkTable } from "@/components/ui";

const norm = (u: string) => u.replace(/\/+$/, "");
const hostOf = (u: string) => u.replace(/^https?:\/\//, "").split("/")[0];

/** Short, plain wording for the states Google's URL Inspection reports. */
function plain(state: string): string {
  const s = state.toLowerCase();
  if (s.includes("submitted and indexed") || s === "indexed") return "Indexed";
  if (s.includes("noindex")) return "Noindex on purpose";
  if (s.includes("new page") || s.includes("not checked yet")) return "New: Google has not checked it yet";
  if (s.includes("discovered")) return "Not indexed: found, not crawled yet";
  if (s.includes("crawled")) return "Not indexed: crawled, not kept";
  if (s.includes("unknown to google")) return "Not indexed: Google has not seen it";
  return state || "Not checked";
}

interface Row { url: string; state: string; impr: number; clicks: number; pos: number | null }

/**
 * Every page of the selected site with its Google status, even when Google has never shown it to anyone.
 * The Search Console reports above only list pages that have had impressions, so a new page (or one stuck at "discovered") never shows up
 * there. This list starts from the sitemap crawl, adds the nightly index check, then the numbers Search Console has.
 */
export default function AllPages() {
  const f = useFilters();
  const health = useHealth().data;
  const crawl = useCrawl().data;
  const gsc = useGSC(f.range).data;

  const rows = useMemo(() => {
    if (!health && !crawl && !gsc) return null;
    const hosts = f.site === "all" ? SITE_HOSTS : [f.site];
    const map = new Map<string, Row>();
    const get = (url: string) => {
      const k = norm(url);
      let r = map.get(k);
      if (!r) { r = { url: k, state: "", impr: 0, clicks: 0, pos: null }; map.set(k, r); }
      return r;
    };
    hosts.forEach((host) => {
      (crawl?.sites?.[host]?.pages ?? []).forEach((p) => { get(p[0]); });
      const idx = health?.index?.[host];
      (idx?.indexedUrls ?? []).forEach((u) => { get(u).state = "Submitted and indexed"; });
      (idx?.urls ?? []).forEach(([u, st]) => { get(u).state = st; });
    });
    if (gsc) {
      gscMerge(gsc, f.site, "pages", 1).forEach((r) => {
        const url = String(r[0]);
        if (f.site !== "all" && hostOf(url) !== f.site) return;
        const x = get(url);
        x.clicks = +r[1];
        x.impr = +r[2];
        x.pos = +r[4] || null;
        if (!x.state && x.impr > 0) x.state = "Submitted and indexed";
      });
    }
    return [...map.values()];
  }, [health, crawl, gsc, f.site]);

  if (!rows) return <SkTable rows={6} />;
  const table: Cell[][] = rows.map((r) => [
    f.site === "all" ? r.url.replace(/^https?:\/\//, "") : r.url.replace(/^https?:\/\/[^/]+/, "") || "/",
    plain(r.state),
    r.impr,
    r.clicks,
    r.pos === null ? "not shown" : r.pos.toFixed(1),
  ]);
  const notIn = rows.filter((r) => /not indexed|found|crawled|unknown/i.test(plain(r.state))).length;
  return (
    <DataTable
      title={`Every page and its Google status (${rows.length})`}
      cols={["Page", "Google status", "Impressions", "Clicks", "Position"]}
      rows={table}
      fmt={[0, 0, "n", "n", 0]}
      sort={2}
      max={15}
      note={`Search Console only reports pages Google has already shown to someone. This list also includes pages with zero impressions, so a new page or one stuck at "found, not crawled yet" is not hidden. ${notIn ? `${notIn} of these are not in Google yet.` : ""} "not shown" means no impressions in this period. Type in the box to find a page.`}
      empty="No pages yet: the nightly checks fill this in."
    />
  );
}
