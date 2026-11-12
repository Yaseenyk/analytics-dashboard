export const SITES: Record<string, string> = {
  "streamerosai.com": "streamerOS",
  "yk.streamerosai.com": "Portfolio",
  "fitrank.streamerosai.com": "FitRank",
  "campus.streamerosai.com": "DefendIt",
  "spotai.streamerosai.com": "SpotAI",
  "tools.streamerosai.com": "Dev Tools",
  "solar.streamerosai.com": "Solar Guide",
  "calc.streamerosai.com": "Money Calcs",
  "images.streamerosai.com": "Image Tools",
  "math.streamerosai.com": "Math Calcs",
  "exams.streamerosai.com": "Exam Dates",
  "esports.streamerosai.com": "Esports Hub",
};
export const SITE_HOSTS = Object.keys(SITES);

/** GA4 stream names (used by the realtime report) to site labels. */
export const STREAMS: Record<string, string> = {
  Streamerosai: "streamerOS",
  "Yaseen Khatib": "Portfolio",
  "Fit Rank": "FitRank",
  "Defend It": "DefendIt",
  "Spot AI": "SpotAI",
  "JSON Encoder": "Dev Tools",
  "Salary Calculator": "Money Calcs",
  "Image Compression": "Image Tools",
  "Age Calculator": "Math Calcs",
  "Solar Panel": "Solar Guide",
  "Exam Information": "Exam Dates",
  "Esports Hub": "Esports Hub",
};

export const gscProperty = (host: string) => `https://${host}/`;

/** Cloudflare Worker that answers the same files fresh from Google. `?api=off` turns it off. */
export const DEFAULT_API = "https://analytics-api.yaseenyk.workers.dev";
/** The portfolio's chat assistant Worker: also reports its nightly re-index at /status/reindex. */
export const CONCIERGE_API = "https://yaseen-concierge.yaseenyk.workers.dev";

export const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)", "var(--s9)", "var(--s10)", "var(--s11)", "var(--s12)"];
export const BRAND = "var(--brand)";
export const SITE_COLOR: Record<string, string> = {
  streamerOS: COLORS[0],
  Portfolio: COLORS[1],
  FitRank: COLORS[2],
  DefendIt: COLORS[3],
  SpotAI: COLORS[4],
  "Dev Tools": COLORS[5],
  "Money Calcs": COLORS[6],
  "Image Tools": COLORS[7],
  "Math Calcs": COLORS[8],
  "Solar Guide": COLORS[9],
  "Exam Dates": COLORS[10],
  "Esports Hub": COLORS[11],
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

export type GroupId = "today" | "visitors" | "google" | "todo" | "more";
/** Which filters make sense on a page: all three, only the site picker, or none (a filter that changes nothing is hidden). */
export type FilterMode = "all" | "site" | "none";
export interface Tab {
  id: string;
  href: string;
  title: string;
  short: string;
  icon: string;
  group: GroupId;
  /** One plain sentence under the title: what this page answers. */
  what: string;
  filters: FilterMode;
}
export const TABS: Tab[] = [
  { id: "today", href: "/", title: "Today", short: "Today", icon: "overview", group: "today", filters: "all", what: "A quick read of how your sites are doing, and what needs you." },
  { id: "traffic", href: "/traffic/", title: "Traffic", short: "Traffic", icon: "sources", group: "visitors", filters: "all", what: "How many people visited, and whether it is going up or down." },
  { id: "sources", href: "/sources/", title: "Where visitors come from", short: "Sources", icon: "sources", group: "visitors", filters: "all", what: "Which websites, apps and searches sent people to you." },
  { id: "pages", href: "/pages/", title: "Pages", short: "Pages", icon: "pages", group: "visitors", filters: "all", what: "Which pages people open the most." },
  { id: "audience", href: "/audience/", title: "Audience", short: "Audience", icon: "audience", group: "visitors", filters: "all", what: "Which countries your visitors are in, and how they behave on the page." },
  { id: "live", href: "/live/", title: "Live now", short: "Live", icon: "live", group: "visitors", filters: "site", what: "Who is on your sites right now (the last 30 minutes)." },
  { id: "leads", href: "/leads/", title: "Leads and clicks", short: "Leads", icon: "leads", group: "visitors", filters: "all", what: "People who took an action: WhatsApp, email, phone call, or a form." },
  { id: "search", href: "/search/", title: "Google searches", short: "Searches", icon: "search", group: "google", filters: "all", what: "What people typed into Google before they found you." },
  { id: "rankings", href: "/rankings/", title: "Rankings", short: "Rankings", icon: "rankings", group: "google", filters: "all", what: "Where you show up on Google for the phrases you care about, and easy wins." },
  { id: "health", href: "/health/", title: "Pages in Google", short: "Checks", icon: "health", group: "google", filters: "site", what: "How many of your pages Google has added to its list, and the checks on them." },
  { id: "ads", href: "/ads/", title: "Google Ads", short: "Ads", icon: "ads", group: "google", filters: "all", what: "Results of any Google ads you run." },
  { id: "fix", href: "/fix/", title: "Get pages into Google", short: "Send to Google", icon: "health", group: "todo", filters: "site", what: "Pages Google does not have yet, and how to send them. About a minute each." },
  { id: "tools", href: "/tools/", title: "Share a link", short: "Share a link", icon: "tools", group: "todo", filters: "none", what: "Make a link and a ready-to-post message for Discord, WhatsApp, LinkedIn and more." },
  { id: "jobs", href: "/jobs/", title: "Automatic jobs", short: "Jobs", icon: "jobs", group: "more", filters: "none", what: "Posts, builds and checks that run by themselves. Did any of them fail?" },
  { id: "help", href: "/help/", title: "Help: what the words mean", short: "Help", icon: "help", group: "more", filters: "none", what: "Plain meanings for every term used here, and how to read the numbers." },
];

export interface Group {
  id: GroupId;
  label: string;
  icon: string;
  /** The page the bottom-bar button opens. */
  home: string;
}
/** The bottom bar on a phone: five big questions instead of twelve tool names. */
export const GROUPS: Group[] = [
  { id: "today", label: "Today", icon: "overview", home: "/" },
  { id: "visitors", label: "Visitors", icon: "audience", home: "/traffic/" },
  { id: "google", label: "Google", icon: "search", home: "/search/" },
  { id: "todo", label: "To do", icon: "todo", home: "/fix/" },
  { id: "more", label: "More", icon: "more", home: "/jobs/" },
];
export const tabsOf = (g: GroupId) => TABS.filter((t) => t.group === g);

export const ICONS: Record<string, string> = {
  overview: "M3 12l9-8 9 8M5 10v10h14V10",
  sources: "M3 17l6-6 4 4 8-8M15 7h6v6",
  pages: "M7 3h8l4 4v14H7zM15 3v4h4",
  leads: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z",
  audience: "M9 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6M17 11a3 3 0 100-6M18.5 14c2 .5 3 2.5 3 5",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  live: "M2 12h4l3-8 4 16 3-8h6",
  tools: "M14 6l4 4-9 9H5v-4zM13 7l4 4",
  ads: "M3 11v2l11 5V6zM14 8.5a4 4 0 010 7M6 14l1 5h3l-1-4.5",
  rankings: "M4 20V11M10 20V5M16 20v-6M22 20H2",
  health: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  jobs: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  more: "M5 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3zM12 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3zM19 10.5a1.6 1.6 0 100 3 1.6 1.6 0 000-3z",
  chevron: "M6 9l6 6 6-6",
  bell: "M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20a2 2 0 004 0",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  todo: "M5 12l4 4 10-10M4 5h2M4 19h2",
  help: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2M12 17h.01",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 7.5h.01",
  open: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  check: "M5 12l5 5 9-10",
};
