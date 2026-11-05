import { describe, expect, it } from "vitest";
import { cleanTitle, personalAsk, usefulIntro } from "@/views/ShareKit";

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

describe("personal ask for servers that block links", () => {
  it("introduces a solo developer, names the site without a URL, and asks for feedback", () => {
    const m = personalAsk({ url: "https://streamerosai.com/", title: "streamerOS", text: "", desc: "x", host: "streamerosai.com", isHome: true });
    expect(m).toMatch(/^Hi everyone, I am a solo developer\. I built streamerOS/);
    expect(m).toContain("It is at streamerosai.com");
    expect(m).not.toMatch(/https?:\/\//);
    expect(m).not.toContain("One thing there");
  });
  it("adds a line about the chosen page when it is not the home page", () => {
    const m = personalAsk({ url: "https://campus.streamerosai.com/templates/", title: "Free synopsis and report templates", text: "", desc: "No sign-up.", host: "campus.streamerosai.com", isHome: false });
    expect(m).toContain("One thing there you might find useful: Free synopsis and report templates. No sign-up.");
    expect(m).toContain("DefendIt");
  });
  it("falls back to title and description for a site it has no words for", () => {
    expect(personalAsk({ url: "https://other.example/p", title: "T", text: "", desc: "D" })).toBe("T\nD");
  });
});
