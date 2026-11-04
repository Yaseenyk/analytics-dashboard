"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";

/** What can be shared. The text is a plain description of the page, editable before copying. */
const ITEMS: { id: string; label: string; url: string; title: string; text: string }[] = [
  { id: "campus", label: "Campus: final year projects", url: "https://campus.streamerosai.com/", title: "Final year project help for BCA, MCA and B.Tech", text: "Final year project help for BCA, MCA and B.Tech students: free guides, report and synopsis templates, and projects explained line by line so you can answer in your viva." },
  { id: "templates", label: "Campus: free templates", url: "https://campus.streamerosai.com/templates/", title: "Free synopsis and report templates", text: "Free synopsis and project report templates for final year projects. No sign-up." },
  { id: "sample", label: "Campus: sample project report", url: "https://campus.streamerosai.com/sample-project-report/", title: "A sample final year project report", text: "A sample final year project report you can read before you write your own." },
  { id: "bca", label: "Campus: BCA project topics", url: "https://campus.streamerosai.com/guides/bca-final-year-project-topics/", title: "BCA final year project topics", text: "BCA final year project topics, with a stack table, a plan that works back from your submission date and a checklist of the documents you need." },
  { id: "qbank", label: "Campus: viva question bank", url: "https://campus.streamerosai.com/question-bank/", title: "Final year project viva questions", text: "89 viva questions for final year projects, each showing what the examiner is testing." },
  { id: "portfolio", label: "Portfolio: home", url: "https://yk.streamerosai.com/", title: "Yaseen Khatib, Senior Full-Stack AI Engineer", text: "My portfolio and AI systems lab: working demos, product write-ups and a RAG concierge you can question about my work." },
  { id: "zoho", label: "Portfolio: Zoho CRM pricing post", url: "https://yk.streamerosai.com/blog/zoho-crm-pricing-india-3-year-cost/", title: "Zoho CRM pricing in India: the 3-year cost", text: "What Zoho CRM costs in India over three years, using Zoho's published yearly prices." },
  { id: "custom", label: "Custom page", url: "https://", title: "", text: "" },
];

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

/** Pick a page and a place; get the message and the tracked link, ready to paste. */
export function ShareKit() {
  const [item, setItem] = useState(ITEMS[0].id);
  const [chan, setChan] = useState("discord");
  const [cam, setCam] = useState("share");
  const [edit, setEdit] = useState<(Parts & { id: string }) | null>(null);
  const [copied, setCopied] = useState("");
  const base = ITEMS.find((i) => i.id === item)!;
  const cur = edit && edit.id === item ? edit : { id: item, title: base.title, text: base.text, url: base.url };
  const c = CHANNELS.find((x) => x.id === chan)!;
  const link = useMemo(() => tag(cur.url, c.src, c.med, cam), [cur.url, c.src, c.med, cam]);
  const message = c.build({ url: link, title: cur.title, text: cur.text });
  const copy = (what: string, v: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(what);
    setTimeout(() => setCopied(""), 1200);
  };
  const set = (p: Partial<Parts>) => setEdit({ ...cur, ...p });
  return (
    <Card title="Share kit" note="Pick the page and where you will post it. You get the message and the tracked link for that place, ready to paste.">
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-mute">What to share</span>
          <select value={item} onChange={(e) => { setItem(e.target.value); setEdit(null); }} className="w-full">
            {ITEMS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-[12.5px] text-mute">Where you will post it</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Channel">
            {CHANNELS.map((x) => (
              <button key={x.id} type="button" aria-pressed={chan === x.id} onClick={() => setChan(x.id)} className={`pill ${chan === x.id ? "on" : ""}`}>{x.label}</button>
            ))}
          </div>
        </div>
        {item === "custom" && (
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
