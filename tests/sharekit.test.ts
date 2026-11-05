import { describe, expect, it } from "vitest";
import { cleanTitle, usefulIntro } from "@/views/ShareKit";

describe("share kit titles", () => {
  it("drops a trailing site name but keeps the rest of the title", () => {
    expect(cleanTitle("Best OBS settings for low-CPU streaming | streamerOS")).toBe("Best OBS settings for low-CPU streaming");
    expect(cleanTitle("Final year project viva questions – DefendIt")).toBe("Final year project viva questions");
    expect(cleanTitle("PM Surya Ghar subsidy guide - Solar Guide")).toBe("PM Surya Ghar subsidy guide");
    expect(cleanTitle("Switch OBS Scenes Without Alt-Tabbing · streamerOS")).toBe("Switch OBS Scenes Without Alt-Tabbing");
  });
  it("leaves titles alone when the tail is part of the title", () => {
    expect(cleanTitle("NVENC vs x264 - which to pick")).toBe("NVENC vs x264 - which to pick");
    expect(cleanTitle("Zoho CRM pricing in India: the 3-year cost")).toBe("Zoho CRM pricing in India: the 3-year cost");
    expect(cleanTitle("")).toBe("");
  });
});

describe("share kit openers", () => {
  it("frames a page by who it helps, varying with the kind of page", () => {
    expect(usefulIntro("streamerosai.com", "https://streamerosai.com/")).toMatch(/^If you're starting to stream .* switches your OBS scenes/);
    expect(usefulIntro("streamerosai.com", "https://streamerosai.com/blog/nvenc-vs-x264/")).toMatch(/setup time:$/);
    expect(usefulIntro("streamerosai.com", "https://streamerosai.com/vs/streamlabs/")).toMatch(/honest comparison:$/);
    expect(usefulIntro("campus.streamerosai.com", "https://campus.streamerosai.com/templates/")).toMatch(/free, no sign-up:$/);
    expect(usefulIntro("images.streamerosai.com", "https://images.streamerosai.com/compress-to-20kb/")).toMatch(/nothing is uploaded:$/);
  });
  it("says nothing for a site it has no words for, and survives a bad URL", () => {
    expect(usefulIntro("unknown.example", "https://unknown.example/x")).toBe("");
    expect(usefulIntro("math.streamerosai.com", "not a url")).toMatch(/^If you need a quick everyday calculation/);
  });
});
