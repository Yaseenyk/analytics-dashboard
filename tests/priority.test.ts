import { describe, expect, it } from "vitest";
import { priorityOf } from "../src/lib/indexing";

describe("priorityOf", () => {
  it("is high when people already search for the page", () => {
    expect(priorityOf("https://math.x.test/percentage-calculator/", "Crawled - currently not indexed", 790).level).toBe("high");
  });
  it("is high for key pages and for pages Google read and refused", () => {
    expect(priorityOf("https://yk.x.test/products/esports-hub/", "Discovered - currently not indexed", 0).level).toBe("high");
    expect(priorityOf("https://yk.x.test/blog/a/", "Crawled - currently not indexed", 0).level).toBe("high");
  });
  it("is medium for a found-but-not-crawled content page", () => {
    expect(priorityOf("https://yk.x.test/blog/b/", "Discovered - currently not indexed", 0).level).toBe("medium");
  });
  it("is low for translated copies, tag pages and unknown pages nobody asked for", () => {
    expect(priorityOf("https://solar.x.test/ta/rooftop/", "URL is unknown to Google", 0).level).toBe("low");
    expect(priorityOf("https://yk.x.test/tag/rag/", "Discovered - currently not indexed", 0).level).toBe("low");
    expect(priorityOf("https://calc.x.test/gbp-to-inr/", "URL is unknown to Google", 0).level).toBe("low");
  });
});
