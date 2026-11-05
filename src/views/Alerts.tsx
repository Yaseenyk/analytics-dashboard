"use client";

import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/data";
import { Icon } from "@/components/ui";

const DOT = { bad: "bg-bad", warn: "bg-yellow-400", good: "bg-good" } as const;
const SEEN = "alerts-seen";
const ago = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return mins < 90 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
};

/** The bell beside the refresh button: a badge for alerts you have not opened yet, and a panel listing them (pages that left Google, broken pages, traffic drops, failed workflows). */
export function NotificationBell() {
  const e = useAlerts();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      setSeen(Number(localStorage.getItem(SEEN)) || 0);
    } catch {
      /* private window */
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (ev: PointerEvent) => !box.current?.contains(ev.target as Node) && setOpen(false);
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const list = e.data ?? [];
  const unread = list.filter((a) => Date.parse(a.at) > seen && a.level !== "good").length;
  const toggle = () => {
    if (open) {
      const now = Date.now();
      setSeen(now);
      try {
        localStorage.setItem(SEEN, String(now));
      } catch {
        /* ignore */
      }
    }
    setOpen(!open);
  };

  return (
    <div ref={box} className="relative">
      <m.button type="button" onClick={toggle} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={open} title="Notifications" whileTap={{ scale: 0.88 }} whileHover={{ rotate: [0, -14, 12, -8, 0] }} transition={{ duration: 0.5 }} className="relative grid h-[30px] w-[30px] place-items-center rounded-full bg-card2 text-mute transition-colors hover:text-brand">
        <Icon name="bell" className="h-4 w-4" />
        <AnimatePresence>
          {unread > 0 && (
            <m.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 16 }} className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 font-mono text-[9.5px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </m.span>
          )}
        </AnimatePresence>
      </m.button>
      <AnimatePresence>
        {open && (
          <m.div role="dialog" aria-label="Notifications" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 30 }} style={{ transformOrigin: "top right" }} className="absolute right-0 top-[38px] z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <h2 className="h2">Notifications</h2>
              <span className="font-mono text-[11px] text-dim">checked every night</span>
            </div>
            <ul className="max-h-[min(60vh,420px)] overflow-y-auto px-4 pb-3">
              {list.length === 0 && <li className="py-6 text-center text-[13px] text-dim">{e.error ? "Could not load notifications." : "Nothing needs a look."}</li>}
              {list.map((a, i) => (
                <m.li key={a.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i + 0.05 }} className="flex items-start gap-3 border-t border-line py-2.5 first:border-t-0">
                  <i className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.level]}`} aria-label={a.level} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold leading-snug">{a.title}</div>
                    {a.detail && <div className="break-words text-[12.5px] text-mute">{a.detail}</div>}
                  </div>
                  <time className="shrink-0 font-mono text-[11px] text-dim" dateTime={a.at}>{ago(a.at)}</time>
                </m.li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
