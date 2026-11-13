import type { Range } from "./config";

export type Cell = string | number;

/** One GA4 report: dimension columns first, then metric columns, in `rows`. */
export interface Rep {
  dims: string[];
  mets: string[];
  rows: Cell[][];
}

export interface GAFile {
  range: string;
  days: number;
  generatedAt: string;
  /** Set when Google would not answer and some or all reports are the last good copy, from this time. */
  staleSince?: string;
  /** Set when Google would not answer and there was no earlier copy: the reason. */
  down?: string;
  /** Set when nothing is saved yet: the page asks for a Refresh. */
  idle?: boolean;
  reports: Record<string, Rep>;
}

/** [query/page/..., clicks, impressions, ctr, position] rows; keyed by the Search Console property. */
export interface GscSite {
  ok: boolean;
  status?: number;
  total?: number[];
  totalPrev?: number[];
  daily?: number[][] | (string | number)[][];
  queries?: Cell[][];
  pages?: Cell[][];
  countries?: Cell[][];
  devices?: Cell[][];
  queryPage?: Cell[][];
  [k: string]: unknown;
}
export interface GSCFile {
  range: string;
  days: number;
  generatedAt: string;
  startDate: string;
  endDate: string;
  search: Record<string, GscSite>;
}

/** Bing Webmaster Tools, per site (host). Rows are [key, clicks, impressions, ctr, position]; daily is [date, clicks, impressions]. */
export interface BingSite {
  ok: boolean;
  url?: string;
  total?: number[];
  totalPrev?: number[];
  daily?: (string | number)[][];
  queries?: Cell[][];
  pages?: Cell[][];
}
export interface BingFile {
  range: string;
  days: number;
  generatedAt: string;
  sites: Record<string, BingSite>;
  error?: string | null;
}

/** Index health: Google's URL Inspection results per site (refreshed daily) and Bing's latest crawl stats. */
export interface HealthSite {
  property: string;
  inspected: number;
  indexed: number;
  notIndexed: number;
  byState: Record<string, number>;
  /** [url, status, last crawl date] for pages that are not indexed. */
  urls: [string, string, string | null][];
  /** URLs Google reports as indexed (lets the page tell when a page you requested has got in). */
  indexedUrls?: string[];
}
export interface HealthFile {
  generatedAt: string;
  indexAt: string | null;
  index: Record<string, HealthSite>;
  bing?: Record<string, { date: string | null; crawled: number; errors: number; inIndex: number; c4xx: number; c5xx: number; blocked: number } | null>;
}

export interface Meta {
  generatedAt: string;
  property: string;
  ranges: Range[];
  keyEvents: string[];
  gsc: Record<string, string | number>;
  errors: string[];
}

export interface LiveRep {
  dims: string[];
  mets: string[];
  rows: Cell[][];
}
export interface Live {
  generatedAt: string;
  streams: LiveRep;
  pages: LiveRep;
  countries: LiveRep;
  events?: LiveRep;
}

export interface Series {
  name: string;
  color?: string;
  fmt?: "n" | "p" | "pos";
  pts: [string, number][];
}

/** One row per day of "pages in Google / pages checked" per site. */
export interface HistoryRow {
  d: string;
  sites: Record<string, [number, number]>;
}
export interface AlertItem {
  id: string;
  kind: string;
  level: "bad" | "warn" | "good";
  title: string;
  detail?: string;
  at: string;
}
/** A tracked phrase: [date, average position, impressions, clicks] per day. */
export interface RankFile {
  generatedAt: string;
  keywords: { kw: string; days: [string, number, number, number][] }[];
}
export interface CrawlIssue {
  url: string;
  kind: "broken" | "redirect" | "noindex" | "no-title" | "not-in-sitemap";
  detail: string;
}
export interface CrawlFile {
  generatedAt: string;
  /** pages: every sitemap page as [url, title, description], from the page's own head. */
  sites: Record<string, { checked: number; counts: Record<string, number>; issues: CrawlIssue[]; pages?: [string, string, string][] }>;
}
/** Lab speed test (Lighthouse, mobile) of each site's home page, newest run last. */
export interface SpeedRun {
  at: string;
  sites: Record<string, { score: number; lcp: number; cls: number; tbt: number; fcp: number } | null>;
}
export interface SpeedFile {
  generatedAt: string;
  runs: SpeedRun[];
}

/** The weekly content optimizer: one measured change per page, judged against Search Console after 28 days. */
export interface Experiment {
  id: string;
  host: string;
  repo: string;
  page: string;
  q: string | null;
  kind?: "rank" | "index";
  state?: string | null;
  type: "title" | "description" | "section" | "faq" | "internal_link" | "none";
  created: string;
  status: "report" | "proposed" | "live" | "done" | "declined";
  baseline: { pos: number; ctr: number; impr: number; clicks: number };
  before: string;
  after: string;
  rationale: string;
  evidence: string[];
  competitors?: { url: string; does_better: string }[];
  authorityGap?: boolean;
  gap?: string;
  pr?: { url: string; number: number; file: string };
  note?: string;
  liveSince?: string;
  judgeAfter?: string;
  verdict?: "better" | "worse" | "same" | "inconclusive";
  delta?: { pos: number; ctr: number; clicks: number } | null;
  judged?: string;
  revertPr?: string;
}
export interface OptimizerFile {
  generatedAt: string;
  lastRun: { date: string; proposed: number; judged: number; mode: "dry" | "pr" | "report"; costUsd: number; log: string[] };
  experiments: Experiment[];
  learnings: Record<string, { date: string; type: string; q: string; page: string; verdict: string; note?: string }[]>;
}

/** Microsoft Clarity behaviour numbers per site, for the last 3 days at the time of each daily export. */
export interface ClaritySignal {
  pct: number | null;
  sessions: number | null;
}
export interface ClaritySite {
  sessions: number | null;
  botSessions: number | null;
  humanSessions: number | null;
  users: number | null;
  pagesPerSession: number | null;
  scrollDepth: number | null;
  activeSeconds: number | null;
  totalSeconds: number | null;
  rageClicks: ClaritySignal | null;
  deadClicks: ClaritySignal | null;
  excessiveScroll: ClaritySignal | null;
  quickBacks: ClaritySignal | null;
  scriptErrors: ClaritySignal | null;
  errorClicks: ClaritySignal | null;
  topPages: { url: string; visits: number | null }[];
}
export interface ClarityFile {
  generatedAt: string;
  runs: { at: string; window: string; sites: Record<string, ClaritySite>; errors: string[] }[];
}
