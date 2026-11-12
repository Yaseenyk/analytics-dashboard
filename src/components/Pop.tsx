"use client";

import { AnimatePresence, m } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Popups that fly out of the box you tapped and fold back into it when closed.
 * Only transform and opacity are animated (never size or position), so it stays smooth on a phone and the text never distorts.
 */
interface Origin { x: number; y: number }
interface Opened { id: string; title: string; origin: Origin | null; render: (close: () => void) => ReactNode }
interface Api { open: (o: Opened) => void; close: () => void; openId: string | null }
const Ctx = createContext<Api>({ open() {}, close() {}, openId: null });
export const usePop = () => useContext(Ctx);

const SPRING = { type: "spring", stiffness: 340, damping: 32, mass: 0.8 } as const;
const FADE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

function Sheet({ o, close }: { o: Opened; close: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [close]);

  // Start from the centre of the tapped box: how far that is from the middle of the screen.
  const dx = o.origin ? o.origin.x - window.innerWidth / 2 : 0;
  const dy = o.origin ? o.origin.y - window.innerHeight / 2 : 40;
  const from = { opacity: 0, x: dx, y: dy, scale: 0.3 };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5 sm:p-8" role="dialog" aria-modal="true" aria-label={o.title}>
      <m.button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <m.div
        initial={from}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        exit={{ ...from, transition: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } }}
        transition={SPRING}
        style={{ borderRadius: 28, willChange: "transform, opacity" }}
        className="relative flex max-h-[calc(100dvh-72px-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-white/10"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[.06] px-6 pb-4 pt-5">
          <h2 className="m-0 min-w-0 truncate text-[17px] font-bold">{o.title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-card2 text-mute active:scale-90">✕</button>
        </div>
        <m.div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-7 pt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ ...FADE, delay: 0.08 }}>
          {o.render(close)}
        </m.div>
      </m.div>
    </div>
  );
}

export function PopProvider({ children }: { children: ReactNode }) {
  const [o, setO] = useState<Opened | null>(null);
  const close = useCallback(() => setO(null), []);
  const open = useCallback((x: Opened) => setO(x), []);
  const api = useMemo<Api>(() => ({ open, close, openId: o?.id ?? null }), [open, close, o]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <AnimatePresence>{o && <Sheet key={o.id} o={o} close={close} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

/** A tappable box that opens a popup. `children` is what the box shows; `render` is what the popup shows. */
export function PopBox({ id, title, className = "", children, render, label, radius = 20 }: { id: string; title: string; className?: string; children: ReactNode; render: (close: () => void) => ReactNode; label?: string; radius?: number }) {
  const { open } = usePop();
  return (
    <button
      type="button"
      style={{ borderRadius: radius }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open({ id, title, render, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
      }}
      aria-haspopup="dialog"
      aria-label={label}
      className={`text-left transition-transform duration-150 active:scale-[.97] ${className}`}
    >
      {children}
    </button>
  );
}
