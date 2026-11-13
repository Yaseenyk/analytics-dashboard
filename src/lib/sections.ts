import type { Scope } from "./data";

/**
 * Which GA4 reports each screen reads. A refresh from a screen asks Google for only these (a handful of calls) instead of all 30,
 * and the Worker merges them into the saved copy. Screens not listed read no GA4 report.
 */
export const GA_NEEDS: Record<string, string[]> = {
  home: ["totals", "totalsPrev", "daily", "events", "pages", "channels", "sourceMedium"],
  visitors: ["totals", "totalsPrev", "daily", "pages"],
  sources: ["channels", "sourceMedium", "campaigns", "campaignContent", "firstTouch", "referrers"],
  pages: ["pages", "landing", "landingSource", "keyEventsByPage"],
  audience: ["totals", "countries", "cities", "devices", "browsers", "os", "languages", "newReturning", "weekday", "hour"],
  leads: ["totals", "events", "eventsFirstTouch", "ctaText", "forms", "keyEventsBySource", "keyEventsDaily", "leadsFirstTouch"],
  ads: ["adsCampaigns"],
};
/** Screens that read Search Console. */
export const GSC_TABS = new Set(["home", "visitors", "search", "rankings"]);

export const scopeFor = (tab: string, site: string): Scope => ({ ga: GA_NEEDS[tab], site });
