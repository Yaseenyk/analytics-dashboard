import { describe, expect, it } from "vitest";
import { describeError } from "../src/components/Boundary";

describe("describeError", () => {
  it("names the problem and where it happened", () => {
    const e = new TypeError("rows.map is not a function");
    e.stack = "TypeError: rows.map is not a function\n    at Feed (Watch.tsx:120:14)";
    const s = describeError(e);
    expect(s).toContain("TypeError: rows.map is not a function");
    expect(s).toContain("Feed (Watch.tsx:120:14)");
  });
  it("copes with things that are not errors", () => {
    expect(describeError("boom")).toContain("boom");
    expect(describeError(null)).toContain("null");
  });
});
