"use client";

import { useEffect, useMemo, useState } from "react";
import { SITES } from "@/lib/config";
import { useAlerts } from "@/lib/data";
import type { AlertItem } from "@/lib/types";
import { PopBox } from "@/components/Pop";
import { Icon } from "@/components/ui";

const SEEN = "alerts-seen";
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
  if (a.kind === "workflow") return { group: "Automation", title: a.title, text: a.detail ? `${a.detail} did not finish.` : "An automatic job did not finish." };
  return { group: "Other", title: a.title, text: a.detail ?? "" };
}

function Detail({ a, back }: { a: AlertItem; back: () => void }) {
  const g = gscStyle(a);
  const host = hostOf(a.title);
  const pages = (a.detail ?? "").split(",").map((p) => p.trim()).filter((p) => p.startsWith("/"));
  return (
    <div>
      <button type="button" onClick={back} className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-card2 pl-2 pr-3.5 text-[13px] font-semibold text-mute"><Icon name="chevron" className="h-4 w-4 rotate-90" />All notifications</button>
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-dim">{g.group} · {ago(a.at)}</div>
      <h3 className="m-0 mt-1 text-[17px] font-bold leading-snug">{g.title}</h3>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-mute">{g.text}</p>
      {pages.length > 0 && (
        <ul className="m-0 mt-3 list-none p-0">
          {pages.map((p) => <li key={p} className="border-t border-line py-2.5 first:border-t-0"><a className="break-all font-mono text-[12.5px] text-ink" href={`https://${host}${p}`} target="_blank" rel="noreferrer">{host}{p}</a></li>)}
        </ul>
      )}
      {a.level !== "good" && <a href="/fix/" className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand/10 text-[13.5px] font-semibold text-brand">See what to do</a>}
    </div>
  );
}

function List({ list, onOpen }: { list: AlertItem[]; onOpen: (a: AlertItem) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    list.forEach((a) => { const g = gscStyle(a).group; m.set(g, [...(m.get(g) ?? []), a]); });
    return [...m.entries()];
  }, [list]);
  if (!list.length) return <p className="m-0 text-[15px] text-mute">No notifications yet. The nightly checks add them here, the same way Search Console does.</p>;
  return (
    <div className="space-y-5">
      {groups.map(([g, items]) => (
        <section key={g}>
          <h3 className="m-0 mb-1.5 text-[12.5px] font-semibold uppercase tracking-wider text-dim">{g}</h3>
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((a) => {
              const s = gscStyle(a);
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a)} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white/[.02] p-3.5 text-left active:bg-card2">
                    <i className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full ${DOT[a.level]}`} aria-label={a.level} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold leading-snug">{s.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-mute">{s.text}</span>
                    </span>
                    <time className="flex-none font-mono text-[11px] text-dim" dateTime={a.at}>{ago(a.at)}</time>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Sheet({ list }: { list: AlertItem[] }) {
  const [sel, setSel] = useState<AlertItem | null>(null);
  return sel ? <Detail a={sel} back={() => setSel(null)} /> : <List list={list} onOpen={setSel} />;
}

/** The bell: a badge for notifications you have not opened, and a popup in Search Console's style (grouped, tap for details). */
export function NotificationBell() {
  const e = useAlerts();
  const [seen, setSeen] = useState(0);
  useEffect(() => { try { setSeen(Number(localStorage.getItem(SEEN)) || 0); } catch { /* private window */ } }, []);
  const list = e.data ?? [];
  const unread = list.filter((a) => Date.parse(a.at) > seen && a.level !== "good").length;
  const markSeen = () => { const now = Date.now(); setSeen(now); try { localStorage.setItem(SEEN, String(now)); } catch { /* ignore */ } };
  return (
    <div onClickCapture={() => setTimeout(markSeen, 600)}>
      <PopBox id="notes" title="Notifications" radius={999} className="relative grid h-[34px] w-[34px] place-items-center bg-card2 text-mute" label={unread ? `Notifications, ${unread} new` : "Notifications"} render={() => <Sheet list={list} />}>
        <Icon name="bell" className="h-[17px] w-[17px]" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 font-mono text-[9.5px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
      </PopBox>
    </div>
  );
}
