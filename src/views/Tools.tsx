"use client";

import { useState } from "react";
import { useMeta } from "@/lib/data";
import { Card } from "@/components/ui";
import { cols2 } from "./kit";

const EVENTS: [string, string][] = [
  ["page_view", "Any page opens"],
  ["generate_lead", "A form or sign-up is sent"],
  ["whatsapp_click", "A WhatsApp link is tapped"],
  ["email_click", "An email link is tapped"],
  ["phone_click", "A phone link is tapped"],
  ["app_download", "An APK or iOS file link is tapped"],
  ["template_download", "A template (.md) download is tapped"],
  ["agreement_signed", "The agreement form is signed"],
  ["file_download", "A PDF, Excel or other document downloads (automatic)"],
  ["calculator_use", "A SpotAI calculator is first used"],
  ["read_depth", "A blog post is read to 25, 50, 75, 100 percent"],
  ["click / scroll", "Outbound link clicks and 90% scrolls (automatic)"],
];

function UtmBuilder() {
  const [v, setV] = useState({ url: "https://campus.streamerosai.com/", src: "linkedin", med: "social", cam: "final-year-launch", con: "" });
  const [copied, setCopied] = useState(false);
  let out = "Enter a full URL starting with https://";
  try {
    const u = new URL(v.url);
    const q: Record<string, string> = { utm_source: v.src, utm_medium: v.med, utm_campaign: v.cam, utm_content: v.con };
    Object.keys(q).forEach((k) => {
      if (q[k]) u.searchParams.set(k, q[k].trim().toLowerCase().replace(/\s+/g, "-"));
    });
    out = u.href;
  } catch {
    /* keep the hint */
  }
  const field = (label: string, key: keyof typeof v, input?: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-mute">{label}</span>
      {input ?? <input type="text" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} className="w-full" />}
    </label>
  );
  return (
    <Card title="UTM link builder" note="Add this to a link you share, so the dashboard shows which channel and post it came from.">
      <div className="mt-3 space-y-3">
        {field("Page URL", "url")}
        {field("Source (where you post it)", "src")}
        {field("Medium", "med", (
          <select value={v.med} onChange={(e) => setV({ ...v, med: e.target.value })} className="w-full">
            {["social", "community", "email", "referral", "cpc", "qr", "share"].map((m) => <option key={m}>{m}</option>)}
          </select>
        ))}
        {field("Campaign name", "cam")}
        {field("Content (optional: which post or button)", "con")}
        <div>
          <span className="mb-1 block text-[12.5px] text-mute">Your link</span>
          <code className="block break-all rounded-[10px] border border-line bg-card2 p-3 font-mono text-[12.5px] text-brand">{out}</code>
        </div>
        <button
          type="button"
          className="rounded-[10px] bg-brand px-4 py-2 font-semibold text-black hover:opacity-90"
          onClick={() => {
            navigator.clipboard?.writeText(out);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </Card>
  );
}

export default function Tools() {
  const meta = useMeta().data;
  return (
    <>
      <div className={cols2}>
        <UtmBuilder />
        <Card title="What is tracked" note="Every key event also carries first_source, first_medium and first_campaign: where that person first arrived from.">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr><th className="border-b border-line px-2 py-2 text-left text-[11.5px] font-medium text-dim">Event</th><th className="border-b border-line px-2 py-2 text-left text-[11.5px] font-medium text-dim">Fires when</th></tr>
              </thead>
              <tbody>
                {EVENTS.map(([k, d]) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="px-2 py-2 font-mono text-[12.5px] text-brand">{k}</td>
                    <td className="px-2 py-2 text-mute">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card title="Data and freshness">
        {meta ? (
          <>
            <p className="sub">
              Generated {new Date(meta.generatedAt).toLocaleString()} from GA4 property {meta.property} and Search Console. The published copy is rebuilt every 2 hours by GitHub Actions, and each page asks the live Worker for fresh numbers when you open it.
            </p>
            {meta.errors.length ? <p className="sub text-amber-300">API warnings:<br />{meta.errors.map((x, i) => <span key={i}>{x}<br /></span>)}</p> : <p className="sub">No API warnings.</p>}
          </>
        ) : <p className="sub">Loading.</p>}
      </Card>
    </>
  );
}
