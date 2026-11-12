/** Plain-language meanings for every term the dashboard uses. Written for someone who has never used Google Analytics. */
export interface Term {
  /** The word as shown. */
  name: string;
  /** What it is, in everyday words. */
  plain: string;
  /** Is a bigger or smaller number better, and what is normal. */
  good?: string;
  /** Where the number comes from. */
  from?: "Google Analytics" | "Search Console" | "Bing" | "Microsoft Clarity" | "this dashboard";
}

export const GLOSSARY: Record<string, Term> = {
  people: { name: "People", plain: "Different humans who opened your site. Someone who comes back five times is still one person.", good: "Higher is better.", from: "Google Analytics" },
  visits: { name: "Visits", plain: "Each time someone arrives and looks around. One person can make several visits, so visits are usually a little higher than people.", good: "Higher is better.", from: "Google Analytics" },
  engaged: { name: "Engaged visits", plain: "Visits where the person really read: stayed 10 seconds or more, opened a second page, or took an action. Robots and accidental clicks almost never do.", good: "Above 40% is healthy for a small site. Below 15% usually means lots of robots.", from: "Google Analytics" },
  leads: { name: "Leads and clicks", plain: "Someone did something you care about: tapped WhatsApp, clicked your email or phone number, filled a form, or downloaded something.", good: "Higher is better. Even 1 is worth a look.", from: "Google Analytics" },
  online: { name: "Online now", plain: "People who were on your sites in the last 30 minutes.", good: "A handful is normal for small sites.", from: "Google Analytics" },
  clicks: { name: "Google clicks", plain: "How many times someone clicked one of your pages in Google search results.", good: "Higher is better.", from: "Search Console" },
  impressions: { name: "Impressions", plain: "How many times Google showed one of your pages in its results, even if nobody clicked. Think of people walking past a shop window.", good: "Higher means more people could find you. It should go up before clicks do.", from: "Search Console" },
  ctr: { name: "CTR (click rate)", plain: "Out of everyone who saw your page on Google, the share who clicked it.", good: "1 to 3% is normal for a small site. Higher is better. A better page title and description raise it.", from: "Search Console" },
  position: { name: "Position", plain: "Where your page appears in Google results. 1 is the very top. 10 is the bottom of page one. 11 to 20 is page two, which almost nobody reads.", good: "Lower is better. Getting under 10 is the goal.", from: "Search Console" },
  direct: { name: "Direct / unknown", plain: "Visitors Google Analytics could not trace: someone typed your address, used a bookmark, or tapped a link inside an app (WhatsApp, Instagram, email) that hides where it came from.", good: "Usually the biggest group on a small site. It is not a problem.", from: "Google Analytics" },
  notset: { name: "(not set)", plain: "Analytics could not work out where the visit came from. Treat it like Direct / unknown.", from: "Google Analytics" },
  ai: { name: "AI assistants", plain: "Visits that came from a link inside ChatGPT, Gemini, Claude, Perplexity or similar.", good: "New and small, but growing across the web. Any number above 0 is a good sign.", from: "Google Analytics" },
  indexed: { name: "In Google (indexed)", plain: "Google has added the page to its list, so it can appear in search. A page that is not in Google cannot be found there at all.", good: "You want close to 100% of your real pages in Google.", from: "Search Console" },
  notindexed: { name: "Not in Google yet", plain: "Google knows about the page, or has not found it yet, but has not added it to search. Sending it by hand (Get pages into Google) can speed this up. It can still take days or weeks.", from: "Search Console" },
  crawl: { name: "Crawled", plain: "A search engine robot visited the page to read it. Crawled does not always mean added to search.", from: "Search Console" },
  bots: { name: "Bots", plain: "Automatic programs, not people: search engine robots, scanners, scrapers.", good: "A lot of bot visits on a small site is normal.", from: "Microsoft Clarity" },
  compare: { name: "Compare with before", plain: "Shows how each number changed against the period just before. For Last 28 days, it compares with the 28 days before that. Green is better, red is worse.", from: "this dashboard" },
  quickwin: { name: "Quick wins", plain: "Phrases where you are on page two of Google. A small improvement to the page can move you onto page one, where the clicks are.", good: "Work on these first.", from: "Search Console" },
  rage: { name: "Rage clicks", plain: "A visitor clicking the same spot again and again because nothing happens. A sign something looks clickable but is not working.", good: "Under 5% of visits is fine.", from: "Microsoft Clarity" },
  scroll: { name: "Scroll depth", plain: "How far down the page people scroll, on average.", good: "Over 50% means people read.", from: "Microsoft Clarity" },
  ga4: { name: "Google Analytics (GA4)", plain: "Counts the people who visit your sites and what they do. It does not know about Google search results.", from: "Google Analytics" },
  gsc: { name: "Search Console", plain: "Google's own report on how your sites do in Google search: what people typed, where you rank, which pages are in Google. Free, and the place where you ask Google to add a page.", from: "Search Console" },
  utm: { name: "Tagged link (utm)", plain: "A link with a small tag on the end, like ?utm_source=discord. When someone opens it, Analytics knows which post brought them. The Share a link page adds this for you.", from: "this dashboard" },
  inspect: { name: "URL inspection", plain: "The box at the top of Search Console where you paste a page link to see whether Google has it, and to ask Google to add it (Request indexing).", from: "Search Console" },
  sitemap: { name: "Sitemap", plain: "A list of all your pages that you hand to Google so it can find them. Your sites already have one.", from: "Search Console" },
};

export const termOf = (k: string): Term | null => GLOSSARY[k] ?? null;
