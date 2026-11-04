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
