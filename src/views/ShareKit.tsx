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
  const m = /^(.*\S)\s*[|–—-]\s*([^|–—-]{2,40})$/.exec(t);
  return m && BRANDS.test(m[2]) ? m[1] : t;
}

interface Parts {
  url: string;
  title: string;
  text: string;
}

/** One entry per place you post. The medium is what the dashboard reports under "Medium". */
const CHANNELS: { id: string; label: string; src: string; med: string; build: (a: Parts) => string }[] = [
  { id: "discord", label: "Discord", src: "discord", med: "community", build: ({ url, title, text }) => `**${title}**\n${text}\n${url}` },
  { id: "whatsapp", label: "WhatsApp", src: "whatsapp", med: "social", build: ({ url, title, text }) => `*${title}*\n${text}\n${url}` },
  { id: "telegram", label: "Telegram", src: "telegram", med: "social", build: ({ url, title, text }) => `**${title}**\n${text}\n${url}` },
  { id: "linkedin", label: "LinkedIn", src: "linkedin", med: "social", build: ({ url, title, text }) => `${title}\n\n${text}\n\n${url}` },
  { id: "x", label: "X (Twitter)", src: "x", med: "social", build: ({ url, text }) => `${text.length > 230 ? text.slice(0, 227).trimEnd() + "..." : text}\n${url}` },
  { id: "reddit", label: "Reddit", src: "reddit", med: "community", build: ({ url, title, text }) => `Title: ${title}\n\n${text}\n\n${url}` },
  { id: "devto", label: "DEV or Hashnode", src: "devto", med: "community", build: ({ url, title, text }) => `## ${title}\n\n${text}\n\n[Read it here](${url})` },
  { id: "email", label: "Email", src: "email", med: "email", build: ({ url, title, text }) => `Subject: ${title}\n\nHi,\n\n${text}\n\n${url}\n\nThanks` },
  { id: "instagram", label: "Instagram bio or story", src: "instagram", med: "social", build: ({ url, title, text }) => `${title}\n${text}\nLink: ${url}` },
];

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
      return { id: url, label: path === "/" ? "Home page" : path, url, title: cleanTitle(title) || SITES[host], text, impr: impr.get(url.replace(/\/$/, "")) ?? 0 };
    });
    list.sort((x, y) => y.impr - x.impr || (x.label === "Home page" ? -1 : y.label === "Home page" ? 1 : x.label.localeCompare(y.label)));
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
    <Card title="Share kit" note="Pick a site, a page and where you will post it. The message is the page's own title and description, so it says only what the page says; edit it as you like. Pages Google already shows most come first.">
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-mute">Site</span>
            <select value={host} onChange={(e) => { setHost(e.target.value); pick(""); }} className="w-full">
              {SITE_HOSTS.map((h) => <option key={h} value={h}>{SITES[h]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-mute">Page ({items.length - 1})</span>
            <select value={base.id} onChange={(e) => pick(e.target.value)} className="w-full">
              {items.map((i) => <option key={i.id} value={i.id}>{i.label}{i.impr ? ` · ${i.impr} impressions` : ""}</option>)}
            </select>
          </label>
        </div>
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
        {chan === "discord" && <p className="sub">Discord shows a preview of the link. Wrap the link in angle brackets to hide the preview.</p>}
      </div>
    </Card>
  );
}
