"use client";

import { SITES } from "@/lib/config";
import { n } from "@/lib/derive";
import { STATUS_HELP, STATUS_ONE, type Status } from "@/lib/pulse";

// unclear = real person who only looked: a neutral grey, not a warning colour
export const COLOR: Record<Status, string> = { real: "var(--good)", unclear: "rgba(160,168,180,.55)", bot: "var(--bad)" };
export const ORDER: Status[] = ["real", "unclear", "bot"];
export const KIND_LABEL: Record<string, string> = { search: "Search engines", social: "Social and messaging", ai: "AI assistants", direct: "Direct or unknown", own: "Your other sites", internal: "Same site", email: "Email", paid: "Paid", other: "Other websites" };
export const CLICK_LABEL: Record<string, string> = { link: "Link", out: "Leaves the site", btn: "Button", tab: "Tab", input: "Form field", mail: "Email link", tel: "Phone link", dl: "Download", goal: "Goal", other: "Not clickable" };
export const site = (h: string) => SITES[h] ?? h;
export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
export const secs = (s: number | null | undefined) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
export const when = (ms: number) => {
  const d = new Date(ms);
  return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const offset = (t: number, t0: number) => { const d = Math.max(0, Math.round((t - t0) / 1000)); return d < 60 ? `+${d}s` : `+${Math.floor(d / 60)}m ${d % 60}s`; };

/** One click in plain words, with how much it matters: strong (a goal), normal, or weak (nothing happened). */
export function say(c: { kind: string; label: string; href: string }): { icon: string; text: string; tone: "strong" | "normal" | "weak" } {
  const l = c.label ? `“${c.label}”` : "";
  switch (c.kind) {
    case "goal": return { icon: "★", text: `Reached the goal “${c.label}”`, tone: "strong" };
    case "dl": return { icon: "⬇", text: `Downloaded ${c.href || c.label || "a file"}`, tone: "strong" };
    case "out": return { icon: "↗", text: `Went to another website: ${c.href || c.label}`, tone: "strong" };
    case "mail": return { icon: "✉", text: `Tapped an email link ${l}`.trim(), tone: "strong" };
    case "tel": return { icon: "☎", text: `Tapped a phone link ${l}`.trim(), tone: "strong" };
    case "link": return { icon: "→", text: `Opened ${c.href || "a page"}${l ? ` from the link ${l}` : ""}`, tone: "normal" };
    case "btn": return { icon: "●", text: `Pressed the button ${l || "(no label)"}`, tone: "normal" };
    case "tab": return { icon: "●", text: `Switched to the tab ${l}`, tone: "normal" };
    case "input": return { icon: "✎", text: `Used the form field ${l || ""}`.trim(), tone: "normal" };
    default: return { icon: "○", text: "Tapped something that is not clickable", tone: "weak" };
  }
}

export function Badge({ s }: { s: Status }) {
  return (
    <span title={STATUS_HELP[s]} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[.06] px-2 py-0.5 text-[11.5px] font-semibold">
      <i className="h-2 w-2 rounded-full" style={{ background: COLOR[s] }} />
      {STATUS_ONE[s]}
    </span>
  );
}

export function Rows({ rows, empty = "Nothing yet." }: { rows: { name: string; v: number; note?: string }[]; empty?: string }) {
  if (!rows.length) return <p className="sub">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {rows.map((r) => (
        <li key={r.name} className="py-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate" title={r.name}>{r.name}</span>
            <span className="shrink-0 whitespace-nowrap font-mono text-[13px]"><b>{n(r.v)}</b>{r.note && <span className="ml-2 inline-block min-w-[2.5rem] text-right text-dim">{r.note}</span>}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><i className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (100 * r.v) / max)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

