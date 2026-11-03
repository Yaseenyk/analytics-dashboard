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
