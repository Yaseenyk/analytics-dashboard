import { describe, expect, it } from "vitest";
import { readChanges, type Change, type ChangesFile } from "@/lib/changes";
import type { GSCFile, HistoryRow } from "@/lib/types";

const H = "x.streamerosai.com";
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));
const gsc = (rows: [string, number, number][]): GSCFile => ({ range: "3m", days: 90, generatedAt: "", startDate: "", endDate: "", search: { [`https://${H}/`]: { ok: true, daily: rows } } });
const hist = (pairs: [string, number][]): HistoryRow[] => pairs.map(([d, n]) => ({ d, sites: { [H]: [n, 50] } }));
const change = (o: Partial<Change> = {}): Change => ({ id: "c1", date: "2026-11-01", title: "Test change", kind: "content", hosts: [H], detail: "", expect: "", ...o });
const file = (...c: Change[]): ChangesFile => ({ generatedAt: "", freezeUntil: null, freezeNote: "", changes: c });

describe("readChanges", () => {
  it("says too early until a week of data exists", () => {
    const g = gsc(days("2026-10-18", 18).map((d) => [d, 1, 10]));
    const r = readChanges(file(change({ date: "2026-11-01" })), g, [], "2026-11-05")[0]!;
    expect(r.verdict).toBe("too-early");
    expect(r.stage).toBe("too-early");
  });

  it("calls a change helpful when impressions rise and clicks hold, or pages get indexed", () => {
    const rows: [string, number, number][] = [...days("2026-10-18", 14).map((d): [string, number, number] => [d, 1, 10]), ...days("2026-11-01", 20).map((d): [string, number, number] => [d, 1, 30])];
    const r = readChanges(file(change()), gsc(rows), [], "2026-11-20")[0]!;
    expect(r.verdict).toBe("helped");
    const idx = readChanges(file(change()), gsc(days("2026-10-18", 30).map((d) => [d, 0, 0])), hist([["2026-10-31", 10], ["2026-11-19", 16]]), "2026-11-20")[0]!;
    expect(idx).toMatchObject({ verdict: "helped", idxAt: 10, idxNow: 16 });
  });

  it("calls it harmful when pages drop out of Google or clicks fall by a lot", () => {
    const g = gsc(days("2026-10-18", 30).map((d) => [d, 0, 0]));
    expect(readChanges(file(change()), g, hist([["2026-10-31", 20], ["2026-11-19", 10]]), "2026-11-20")[0]!.verdict).toBe("hurt");
    const rows: [string, number, number][] = [...days("2026-10-18", 14).map((d): [string, number, number] => [d, 2, 40]), ...days("2026-11-01", 20).map((d): [string, number, number] => [d, 0, 40])];
    expect(readChanges(file(change()), gsc(rows), [], "2026-11-20")[0]!.verdict).toBe("hurt");
  });

  it("says no clear effect when numbers hardly move, and names changes that landed nearby", () => {
    const rows: [string, number, number][] = days("2026-10-18", 34).map((d): [string, number, number] => [d, 1, 12]);
    const rs = readChanges(file(change(), change({ id: "c2", date: "2026-11-04", title: "Other change" })), gsc(rows), [], "2026-11-20");
    expect(rs[0]).toMatchObject({ verdict: "no-effect", overlaps: ["Other change"] });
    expect(rs[1]!.overlaps).toEqual(["Test change"]);
  });
});
