import { describe, expect, it } from "vitest";
import { cleanTitle } from "@/views/ShareKit";

describe("share kit titles", () => {
  it("drops a trailing site name but keeps the rest of the title", () => {
    expect(cleanTitle("Best OBS settings for low-CPU streaming | streamerOS")).toBe("Best OBS settings for low-CPU streaming");
    expect(cleanTitle("Final year project viva questions – DefendIt")).toBe("Final year project viva questions");
    expect(cleanTitle("PM Surya Ghar subsidy guide - Solar Guide")).toBe("PM Surya Ghar subsidy guide");
  });
  it("leaves titles alone when the tail is part of the title", () => {
    expect(cleanTitle("NVENC vs x264 - which to pick")).toBe("NVENC vs x264 - which to pick");
    expect(cleanTitle("Zoho CRM pricing in India: the 3-year cost")).toBe("Zoho CRM pricing in India: the 3-year cost");
    expect(cleanTitle("")).toBe("");
  });
});
