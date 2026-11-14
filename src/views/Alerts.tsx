"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { SITES } from "@/lib/config";
import { useAlerts, useGA, useGSC } from "@/lib/data";
import { localAlerts } from "@/lib/insights";
import type { AlertItem } from "@/lib/types";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

const READ = "alerts-read";
const listeners = new Set<() => void>();
let readCache: string | null = null;
let readSet = new Set<string>();
/** Which notifications you have opened, kept in this browser by id. One shared copy, so the bell badge and the list always agree. */
function loadRead(): Set<string> {
  let raw = "";
  try { raw = localStorage.getItem(READ) ?? ""; } catch { /* private window */ }
  if (raw !== readCache) { readCache = raw; try { readSet = new Set(JSON.parse(raw || "[]") as string[]); } catch { readSet = new Set(); } }
  return readSet;
}
function saveRead(next: Set<string>) {
  const arr = [...next].slice(-300);
  try { localStorage.setItem(READ, JSON.stringify(arr)); } catch { /* ignore */ }
  readCache = null;
  listeners.forEach((l) => l());
}
const markRead = (ids: string[]) => { const n = new Set(loadRead()); let ch = false; ids.forEach((i) => { if (!n.has(i)) { n.add(i); ch = true; } }); if (ch) saveRead(n); };
const EMPTY = new Set<string>();
function useRead(): Set<string> {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    loadRead,
    () => EMPTY,
  );
}
const isUnread = (a: AlertItem, read: Set<string>) => a.level !== "good" && !read.has(a.id);
const DOT = { bad: "bg-bad", warn: "bg-yellow-400", good: "bg-good" } as const;
const ago = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return mins < 90 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
};
const hostOf = (t: string) => /on (\S+)$/.exec(t)?.[1] ?? "";
const count = (t: string) => +(/^(\d+)/.exec(t)?.[1] ?? 1);

/** The same wording Search Console uses in its message inbox, for the checks we run. */
export function gscStyle(a: AlertItem): { group: string; title: string; text: string } {
  const host = hostOf(a.title);
  const name = SITES[host] ?? host;
  const k = count(a.title);
  if (a.kind === "dropped") return { group: "Page indexing", title: `Page indexing issue detected${name ? ` on ${name}` : ""}`, text: `${k} ${k === 1 ? "page is" : "pages are"} no longer in Google. Pages that are not in Google cannot appear in search results.` };
  if (a.kind === "indexed") return { group: "Page indexing", title: `New pages indexed${name ? ` on ${name}` : ""}`, text: `${k} new ${k === 1 ? "page was" : "pages were"} added to Google and can now appear in search.` };
  if (a.kind === "local") return { group: "Data checks", title: a.title, text: a.detail ?? "" };
  if (a.kind === "workflow") return { group: "Automation", title: a.title, text: a.detail ? `${a.detail} did not finish.` : "An automatic job did not finish." };
  return { group: "Other", title: a.title, text: a.detail ?? "" };
}

function Detail({ a, back, close }: { a: AlertItem; back: () => void; close: () => void }) {
  const g = gscStyle(a);
  const host = hostOf(a.title);
  const pages = (a.detail ?? "").split(",").map((p) => p.trim()).filter((p) => p.startsWith("/"));
  return (
    <div>
      <button type="button" onClick={back} className="mb-4 inline-flex min-h-9 items-center gap-1 rounded-lg border border-line pl-2 pr-3 text-[13px] font-medium text-mute hover:text-ink"><Icon name="chevron" className="h-4 w-4 rotate-90" />All notifications</button>
      <div className="text-[11.5px] font-medium uppercase tracking-wider text-dim">{g.group} · {ago(a.at)}</div>
      <h3 className="m-0 mt-1 text-[17px] font-bold leading-snug">{g.title}</h3>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-mute">{g.text}</p>
      {pages.length > 0 && (
        <ul className="m-0 mt-3 list-none p-0">
          {pages.map((p) => <li key={p} className="border-t border-line py-2.5 first:border-t-0"><a className="break-all font-mono text-[12.5px] text-ink" href={`https://${host}${p}`} target="_blank" rel="noreferrer">{host}{p}</a></li>)}
        </ul>
      )}
      {a.level !== "good" && <Link href="/fix/" onClick={close} className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand/10 text-[13.5px] font-semibold text-brand">See what to do</Link>}
    </div>
  );
}

function List({ list, onOpen }: { list: AlertItem[]; onOpen: (a: AlertItem) => void }) {
  const read = useRead();
  const [tab, setTab] = useState<"all" | "new">("all");
  const unread = list.filter((a) => isUnread(a, read));
  const shown = tab === "new" ? unread : list;
  const groups = useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    [...shown].sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).forEach((a) => { const g = gscStyle(a).group; m.set(g, [...(m.get(g) ?? []), a]); });
    return [...m.entries()];
  }, [shown]);
  if (!list.length) return <p className="m-0 text-[15px] text-mute">Nothing to report. Warnings about old numbers, bot-like traffic, dropped pages and failed jobs show up here.</p>;
  const tabBtn = (id: "all" | "new", label: string) => (
    <button type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === id ? "bg-white/[.09] text-ink" : "text-mute hover:text-ink"}`}>{label}</button>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-0.5 rounded-lg border border-line bg-card p-[3px]">{tabBtn("all", `All ${list.length}`)}{tabBtn("new", `Unread ${unread.length}`)}</div>
        <button type="button" disabled={!unread.length} onClick={() => markRead(list.map((a) => a.id))} className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-brand disabled:text-dim">Mark all as read</button>
      </div>
      {!shown.length && <p className="m-0 text-[14.5px] text-mute">You are all caught up.</p>}
      <div className="space-y-5">
        {groups.map(([g, items]) => (
          <section key={g}>
            <h3 className="m-0 mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-dim">{g}</h3>
            <ul className="m-0 list-none space-y-2 p-0">
              {items.map((a) => {
                const s = gscStyle(a);
                const un = isUnread(a, read);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => { markRead([a.id]); onOpen(a); }} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-line2 ${un ? "border-brand/25 bg-brand/[.05]" : "border-line bg-transparent"}`}>
                      <i className={`mt-[7px] h-2 w-2 flex-none rounded-full ${DOT[a.level]}`} role="img" aria-label={a.level === "bad" ? "Needs fixing" : a.level === "warn" ? "Needs a look" : "Good news"} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] leading-snug ${un ? "font-semibold" : "font-medium text-mute"}`}>{s.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-dim">{s.text}</span>
                      </span>
                      <time className="flex-none text-[11.5px] text-dim" dateTime={a.at}>{ago(a.at)}</time>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Sheet({ list, close }: { list: AlertItem[]; close: () => void }) {
  const [sel, setSel] = useState<AlertItem | null>(null);
  return sel ? <Detail a={sel} back={() => setSel(null)} close={close} /> : <List list={list} onOpen={setSel} />;
}

/** The bell: a badge counting notifications you have not opened. Opening one marks just that one as read. */
export function NotificationBell() {
  const e = useAlerts();
  const read = useRead();
  const ga = useGA("28d").data, gsc = useGSC("28d").data;
  const list = useMemo(() => [...localAlerts(ga, gsc), ...(e.data ?? [])].sort((x, y) => Date.parse(y.at) - Date.parse(x.at)), [ga, gsc, e.data]);
  const unread = list.filter((a) => isUnread(a, read)).length;
  return (
    <PopBox id="notes" title="Notifications" radius={8} className="relative grid h-9 w-9 place-items-center border border-line bg-card text-mute hover:text-ink" label={unread ? `Notifications, ${unread} unread` : "Notifications"} render={(close) => <Sheet list={list} close={close} />}>
      <Icon name="bell" className="h-[17px] w-[17px]" />
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10.5px] font-bold leading-none text-white ring-2 ring-bg">{unread > 9 ? "9+" : unread}</span>}
    </PopBox>
  );
}
