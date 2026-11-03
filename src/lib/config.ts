export const SITES: Record<string, string> = {
  "streamerosai.com": "streamerOS",
  "yk.streamerosai.com": "Portfolio",
  "fitrank.streamerosai.com": "FitRank",
  "campus.streamerosai.com": "DefendIt",
  "spotai.streamerosai.com": "SpotAI",
};
export const SITE_HOSTS = Object.keys(SITES);

/** GA4 stream names (used by the realtime report) to site labels. */
export const STREAMS: Record<string, string> = {
  Streamerosai: "streamerOS",
  "Yaseen Khatib": "Portfolio",
  "Fit Rank": "FitRank",
  "Defend It": "DefendIt",
  "Spot AI": "SpotAI",
};

export const gscProperty = (host: string) => `https://${host}/`;

/** Cloudflare Worker that answers the same files fresh from Google. `?api=off` turns it off. */
export const DEFAULT_API = "https://analytics-api.yaseenyk.workers.dev";

export const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];
export const BRAND = "var(--brand)";
export const SITE_COLOR: Record<string, string> = {
  streamerOS: COLORS[0],
  Portfolio: COLORS[1],
  FitRank: COLORS[2],
  DefendIt: COLORS[3],
  SpotAI: COLORS[4],
};
export const CAT_COLOR: Record<string, string> = {
  "Search engines": COLORS[0],
  "Social and messaging": COLORS[1],
  "AI assistants": COLORS[2],
  Direct: COLORS[3],
  "Communities and dev sites": COLORS[4],
  Email: COLORS[5],
  "Other websites": COLORS[6],
};

export interface Range {
  id: string;
  days: number;
  label: string;
}
export const DEFAULT_RANGES: Range[] = [
  { id: "7d", days: 7, label: "Last 7 days" },
  { id: "28d", days: 28, label: "Last 28 days" },
  { id: "3m", days: 90, label: "Last 3 months" },
  { id: "6m", days: 180, label: "Last 6 months" },
  { id: "12m", days: 365, label: "Last 12 months" },
  { id: "16m", days: 480, label: "Last 16 months" },
];

export interface Tab {
  id: string;
  href: string;
  title: string;
  short: string;
  icon: string;
}
export const TABS: Tab[] = [
  { id: "overview", href: "/", title: "Overview", short: "Overview", icon: "overview" },
  { id: "sources", href: "/sources/", title: "Where visitors come from", short: "Sources", icon: "sources" },
  { id: "pages", href: "/pages/", title: "Pages", short: "Pages", icon: "pages" },
  { id: "leads", href: "/leads/", title: "Leads and clicks", short: "Leads", icon: "leads" },
  { id: "search", href: "/search/", title: "Search (Google)", short: "Search", icon: "search" },
  { id: "audience", href: "/audience/", title: "Audience", short: "Audience", icon: "audience" },
  { id: "live", href: "/live/", title: "Live now", short: "Live", icon: "live" },
  { id: "tools", href: "/tools/", title: "Tools", short: "Tools", icon: "tools" },
];
export const PRIMARY_TABS = ["overview", "sources", "pages", "leads", "search"];

export const ICONS: Record<string, string> = {
  overview: "M3 12l9-8 9 8M5 10v10h14V10",
  sources: "M3 17l6-6 4 4 8-8M15 7h6v6",
  pages: "M7 3h8l4 4v14H7zM15 3v4h4",
  leads: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z",
  audience: "M9 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6M17 11a3 3 0 100-6M18.5 14c2 .5 3 2.5 3 5",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  live: "M2 12h4l3-8 4 16 3-8h6",
  tools: "M14 6l4 4-9 9H5v-4zM13 7l4 4",
  more: "M5 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3zM12 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3zM19 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3z",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
};
