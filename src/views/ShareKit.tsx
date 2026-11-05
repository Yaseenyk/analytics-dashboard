"use client";

import { useMemo, useState } from "react";
import { SITES, SITE_HOSTS } from "@/lib/config";
import { useCrawl, useGSC } from "@/lib/data";
import { gscMerge } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { Card } from "@/components/ui";

/** Pages come from the nightly site check (every sitemap page of every site, with the page's own title and description),
    so the kit covers all ten sites and never describes a page in words the page does not use itself. */
const BRANDS = /streameros|yaseen|khatib|fitrank|defendit|campus|spotai|solar|calc|tools|image|math/i;
/** "How to pick a GPU | streamerOS" -> "How to pick a GPU": drop a trailing site name, keep everything else. */
export function cleanTitle(t: string): string {
  const m = /^(.*\S)\s*[|·–—-]\s*([^|·–—-]{2,40})$/.exec(t);
  return m && BRANDS.test(m[2]) ? m[1] : t;
}

/** One opening line per site and kind of page: who the page helps and how, in plain words. It never claims more than the
    site itself says on its home page; the page's own description follows it. Edit the text before posting if you like. */
const OPENERS: Record<string, { who: string; home: string; rules: [RegExp, string][]; other: string }> = {
  "streamerosai.com": {
    who: "If you're starting to stream on Twitch or YouTube with OBS",
    home: "this is a Windows app that switches your OBS scenes from live chat, on your own PC:",
    rules: [[/^\/vs\//, "and weighing your options, this is an honest comparison:"], [/^\/blog\/|^\/guides\//, "this might save you some setup time:"], [/^\/features\//, "this is one thing it does:"]],
    other: "this might be useful:",
  },
  "yk.streamerosai.com": {
    who: "If you're hiring for, or building, production AI systems (RAG, agents, real-time)",
    home: "here is my portfolio with working demos and write-ups:",
    rules: [[/^\/blog\//, "I wrote this from real work, not theory:"], [/^\/solutions\//, "this is how I'd approach it:"], [/^\/hire\//, "this is how to work with me:"]],
    other: "this might be useful:",
  },
  "fitrank.streamerosai.com": {
    who: "If you manage staff rotas or shift assignments",
    home: "this is an AI scheduler whose every answer a manager can check and overrule:",
    rules: [[/^\/blog\//, "this might help:"], [/^\/solutions\/|^\/use-cases\//, "here is how it would work in your case:"]],
    other: "this might be useful:",
  },
  "campus.streamerosai.com": {
    who: "If you're a BCA, MCA or B.Tech student with a final year project due",
    home: "this might take some of the stress out of it:",
    rules: [[/^\/templates\//, "these templates are free, no sign-up:"], [/^\/question-bank\//, "practise your viva with these:"], [/^\/guides\//, "this guide might help:"], [/^\/projects\//, "here is a project explained line by line:"]],
    other: "this might be useful:",
  },
  "spotai.streamerosai.com": {
    who: "If you run a gym in India, or train at one",
    home: "this is an AI gym app with form checks on your phone and a simple owner view:",
    rules: [[/^\/blog\/|^\/guides\//, "this might be useful:"], [/calculator/, "a free calculator for this:"], [/^\/features\//, "this is one thing it does:"]],
    other: "this might be useful:",
  },
  "tools.streamerosai.com": {
    who: "If you work with JSON or Base64 and would rather not paste your data into a random website",
    home: "these tools run in your browser and upload nothing:",
    rules: [],
    other: "this one runs in your browser and uploads nothing:",
  },
  "solar.streamerosai.com": {
    who: "If you're thinking about rooftop solar under PM Surya Ghar",
    home: "this is an independent guide with every figure sourced:",
    rules: [],
    other: "this part of the guide might help (every figure is sourced):",
  },
  "calc.streamerosai.com": {
    who: "If you need a quick money calculation (pay raise, salary to hourly, overtime, currency)",
    home: "these are free and instant:",
    rules: [],
    other: "this one is free and instant:",
  },
  "images.streamerosai.com": {
    who: "If you need to shrink an image to a set size or change its format without uploading it anywhere",
    home: "these run in your browser:",
    rules: [],
    other: "this one runs in your browser, nothing is uploaded:",
  },
  "math.streamerosai.com": {
    who: "If you need a quick everyday calculation (percentage, age, days between dates)",
    home: "these are free and show the formula:",
    rules: [],
    other: "this one is free and shows the formula:",
  },
};
/** The opening line for a page: "If you're ..., this might help:". Empty for a site we have no words for. */
export function usefulIntro(host: string, url: string): string {
  const o = OPENERS[host];
  if (!o) return "";
  let path = "/";
  try { path = new URL(url).pathname || "/"; } catch { /* keep "/" */ }
  if (path === "/") return `${o.who}, ${o.home}`;
  const hit = o.rules.find(([re]) => re.test(path));
  return `${o.who}, ${hit ? hit[1] : o.other}`;
}

interface Parts {
  url: string;
  title: string;
  text: string;
}

/** One entry per place you post. The medium is what the dashboard reports under "Medium". */
const CHANNELS: { id: string; label: string; src: string; med: string; build: (a: Parts) => string }[] = [
  // Plain text on purpose: many servers run AutoMod rules that block bold, headings and links.
  { id: "discord", label: "Discord", src: "discord", med: "community", build: ({ url, title, text }) => `${title}\n${text}\n<${url}>` },
  { id: "discord-nolink", label: "Discord (no link)", src: "discord", med: "community", build: ({ url, title, text }) => `${title}\n${text}\n(Search for ${hostOf(url)} if you want to look it up.)` },
  { id: "whatsapp", label: "WhatsApp", src: "whatsapp", med: "social", build: ({ url, title, text }) => `*${title}*\n${text}\n${url}` },
  { id: "telegram", label: "Telegram", src: "telegram", med: "social", build: ({ url, title, text }) => `**${title}**\n${text}\n${url}` },
  { id: "linkedin", label: "LinkedIn", src: "linkedin", med: "social", build: ({ url, title, text }) => `${title}\n\n${text}\n\n${url}` },
  { id: "x", label: "X (Twitter)", src: "x", med: "social", build: ({ url, text }) => `${text.length > 230 ? text.slice(0, 227).trimEnd() + "..." : text}\n${url}` },
  { id: "reddit", label: "Reddit", src: "reddit", med: "community", build: ({ url, title, text }) => `Title: ${title}\n\n${text}\n\n${url}` },
  { id: "devto", label: "DEV or Hashnode", src: "devto", med: "community", build: ({ url, title, text }) => `## ${title}\n\n${text}\n\n[Read it here](${url})` },
  { id: "email", label: "Email", src: "email", med: "email", build: ({ url, title, text }) => `Subject: ${title}\n\nHi,\n\n${text}\n\n${url}\n\nThanks` },
  { id: "instagram", label: "Instagram bio or story", src: "instagram", med: "social", build: ({ url, title, text }) => `${title}\n${text}\nLink: ${url}` },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
function tag(url: string, src: string, med: string, cam: string): string {
  try {
    const u = new URL(url);
    const q: Record<string, string> = { utm_source: src, utm_medium: med, utm_campaign: cam };
    Object.keys(q).forEach((k) => q[k] && u.searchParams.set(k, q[k].trim().toLowerCase().replace(/\s+/g, "-")));
    return u.href;
  } catch {
    return url;
  }
}

interface Item {
  id: string;
  label: string;
  url: string;
  title: string;
  text: string;
  impr: number;
}
const CUSTOM: Item = { id: "custom", label: "Custom page", url: "https://", title: "", text: "", impr: 0 };

/** Pick a site, a page and a place; get the message and the tracked link, ready to paste. */
export function ShareKit() {
  const f = useFilters();
  const crawl = useCrawl();
  const gsc = useGSC(f.range).data;
  const [host, setHost] = useState<string>(SITE_HOSTS[0]);
  const [item, setItem] = useState<string>("");
  const [chan, setChan] = useState("discord");
  const [cam, setCam] = useState("share");
  const [edit, setEdit] = useState<(Parts & { id: string }) | null>(null);
  const [copied, setCopied] = useState("");

  const items = useMemo<Item[]>(() => {
    const pages = crawl.data?.sites[host]?.pages ?? [];
    const impr = new Map<string, number>();
    if (gsc) gscMerge(gsc, host, "pages", 1).forEach((r) => impr.set(String(r[0]).replace(/\/$/, ""), +r[3]));
    const list = pages.map(([url, title, text]) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const intro = usefulIntro(host, url);
      return { id: url, label: path === "/" ? "/ (home page)" : path, url, title: cleanTitle(title) || SITES[host], text: [intro, text || cleanTitle(title)].filter(Boolean).join("\n"), impr: impr.get(url.replace(/\/$/, "")) ?? 0 };
    });
    list.sort((x, y) => y.impr - x.impr || (x.label.startsWith("/ ") ? -1 : y.label.startsWith("/ ") ? 1 : x.label.localeCompare(y.label)));
    return [...list, CUSTOM];
  }, [crawl.data, gsc, host]);
  const base = items.find((i) => i.id === item) ?? items[0];
  const cur = edit && edit.id === base.id ? edit : { id: base.id, title: base.title, text: base.text, url: base.url };
  const c = CHANNELS.find((x) => x.id === chan)!;
  const link = useMemo(() => tag(cur.url, c.src, c.med, cam), [cur.url, c.src, c.med, cam]);
  const message = c.build({ url: link, title: cur.title, text: cur.text });
  const copy = (what: string, v: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(what);
    setTimeout(() => setCopied(""), 1200);
  };
  const set = (p: Partial<Parts>) => setEdit({ ...cur, ...p });
  const pick = (id: string) => {
    setItem(id);
    setEdit(null);
  };
  const noPages = !!crawl.data && !(crawl.data.sites[host]?.pages?.length);
  return (
    <Card title="Share kit" note="Pick a site, a page and where you will post it. The message opens with who the page helps and how, then the page's own description, so it reads as a tip, not an advert. Edit anything before copying. Pages Google already shows most come first.">
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-mute">Site</span>
            <select value={host} onChange={(e) => { setHost(e.target.value); pick(""); }} className="w-full">
              {SITE_HOSTS.map((h) => <option key={h} value={h}>{SITES[h]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-mute">Page URL ({items.length - 1} pages)</span>
            <select value={base.id} onChange={(e) => pick(e.target.value)} className="w-full font-mono text-[12.5px]">
              {items.map((i) => <option key={i.id} value={i.id}>{i.label}{i.impr ? `  (${i.impr} impressions)` : ""}</option>)}
            </select>
          </label>
        </div>
        {base.id !== "custom" && <code className="block break-all font-mono text-[11.5px] text-dim">{cur.url}</code>}
        {!crawl.data && !crawl.error && <p className="sub">Loading the page list…</p>}
        {(crawl.error && !crawl.data) || noPages ? <p className="sub">No page list for this site yet: it fills in after the nightly site check. Use Custom page for now.</p> : null}
        <div>
          <span className="mb-1 block text-[12.5px] text-mute">Where you will post it</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Channel">
            {CHANNELS.map((x) => (
              <button key={x.id} type="button" aria-pressed={chan === x.id} onClick={() => setChan(x.id)} className={`pill ${chan === x.id ? "on" : ""}`}>{x.label}</button>
            ))}
          </div>
        </div>
        {base.id === "custom" && (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-mute">Page URL</span>
            <input type="text" value={cur.url} onChange={(e) => set({ url: e.target.value })} className="w-full" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-mute">Headline</span>
          <input type="text" value={cur.title} onChange={(e) => set({ title: e.target.value })} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-mute">Message (edit it if you like)</span>
          <textarea value={cur.text} onChange={(e) => set({ text: e.target.value })} rows={3} className="w-full rounded-[10px] bg-card2 px-3 py-2 text-ink" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-mute">Campaign name</span>
          <input type="text" value={cam} onChange={(e) => setCam(e.target.value)} className="w-full" />
        </label>
        <div>
          <span className="mb-1 block text-[12.5px] text-mute">Ready to paste into {c.label}</span>
          <pre className="whitespace-pre-wrap break-words rounded-[10px] bg-card2 p-3 font-mono text-[12.5px] text-ink">{message}</pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-[10px] bg-brand px-4 py-2 font-semibold text-black hover:opacity-90" onClick={() => copy("msg", message)}>{copied === "msg" ? "Copied" : "Copy message"}</button>
          <button type="button" className="rounded-[10px] bg-card2 px-4 py-2 text-ink hover:bg-white/[.08]" onClick={() => copy("link", link)}>{copied === "link" ? "Copied" : "Copy link only"}</button>
        </div>
        {chan === "x" && <p className="sub">Posts on X are cut to 280 characters, so the message is trimmed to fit.</p>}
        {chan.startsWith("discord") && (
          <div className="rounded-[10px] bg-card2 p-3 text-[12.5px] leading-relaxed text-mute">
            <b className="text-ink">Where this works on Discord.</b> Post in servers about the topic (for streamerOS: OBS and streaming servers; for DefendIt: student and college servers), in a channel meant for it such as #self-promo, #showcase or #resources, after you have taken part in the server. Read the rules first: many servers block links from new members and time people out for it, and an off-topic channel in an unrelated server reads as spam no matter how the message is written. The message is plain text and the link sits in angle brackets, so it does not show a big preview card. If the server blocks links, use <i>Discord (no link)</i>, which names the site without a link; that visit will not be tracked.
          </div>
        )}
      </div>
    </Card>
  );
}
