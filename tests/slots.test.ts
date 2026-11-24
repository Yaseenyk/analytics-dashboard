import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, no type declarations
import { REFRESH_RANGES, refreshSlot } from "../worker/src/slots.js";

const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 25, h, m));
type Slot = { kind: string; id: string; part: number } | null;

describe("the 4-hour refresh of the saved Google data", () => {
  it("runs only in the 4-hour hours", () => {
    for (const h of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23]) for (const m of [5, 6, 9, 15]) expect(refreshSlot(at(h, m), 3)).toBeNull();
    for (const h of [0, 4, 8, 12, 16, 20]) expect(refreshSlot(at(h, 5), 3)).not.toBeNull();
  });

  it("goes Analytics, then the Search Console parts, for each range in turn, one job a minute", () => {
    const got = Array.from({ length: 12 }, (_, i) => refreshSlot(at(8, 5 + i), 3) as Slot);
    expect(got.map((s) => (s ? `${s.kind}:${s.id}:${s.part}` : "none"))).toEqual([
      "ga:28d:0", "gsc:28d:0", "gsc:28d:1", "gsc:28d:2",
      "ga:7d:0", "gsc:7d:0", "gsc:7d:1", "gsc:7d:2",
      "ga:3m:0", "gsc:3m:0", "gsc:3m:1", "gsc:3m:2",
    ]);
  });

  it("stays out of the minutes the Worker's daily jobs use and is finished before them", () => {
    expect(refreshSlot(at(4, 0), 3)).toBeNull();
    expect(refreshSlot(at(4, 4), 3)).toBeNull();
    expect(refreshSlot(at(4, 17), 3)).toBeNull();
    expect(refreshSlot(at(4, 59), 3)).toBeNull();
  });

  it("makes room for more Search Console parts when more properties are added", () => {
    const last = refreshSlot(at(12, 5 + 5 * REFRESH_RANGES.length - 1), 4) as Slot;
    expect(last).toEqual({ kind: "gsc", id: "3m", part: 3 });
    expect(refreshSlot(at(12, 5 + 5 * REFRESH_RANGES.length), 4)).toBeNull();
  });
});
