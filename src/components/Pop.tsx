"use client";

import { AnimatePresence, LayoutGroup, m } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Popups that unfold out of the box you tapped. The box and the sheet share one layout id, so the box visibly grows into the sheet
 * (corners and all), the content fades up behind it, and closing folds the sheet back into the exact box it came from.
 */
interface Opened { id: string; title: string; render: (close: () => void) => ReactNode }
interface Api { open: (o: Opened) => void; close: () => void; openId: string | null }
const Ctx = createContext<Api>({ open() {}, close() {}, openId: null });
export const usePop = () => useContext(Ctx);

const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 } as const;

function Sheet({ o, close }: { o: Opened; close: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [close]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5 sm:p-8" role="dialog" aria-modal="true" aria-label={o.title}>
      <m.button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
      <m.div
        layoutId={`pop-${o.id}`}
        transition={SPRING}
        style={{ borderRadius: 28 }}
        className="relative flex max-h-[calc(100dvh-72px-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-white/10"
      >
        <m.div className="flex items-center justify-between gap-3 border-b border-white/[.06] px-6 pb-4 pt-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.12, duration: 0.25 }}>
          <h2 className="m-0 min-w-0 truncate text-[17px] font-bold">{o.title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-card2 text-mute active:scale-90">✕</button>
        </m.div>
        <m.div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-7 pt-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ delay: 0.16, duration: 0.3 }}>
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
      <LayoutGroup>
        {children}
        <AnimatePresence>{o && <Sheet key={o.id} o={o} close={close} />}</AnimatePresence>
      </LayoutGroup>
    </Ctx.Provider>
  );
}

/** A tappable box that opens a popup. `children` is what the box shows; `render` is what the popup shows. */
export function PopBox({ id, title, className = "", children, render, label, radius = 20 }: { id: string; title: string; className?: string; children: ReactNode; render: (close: () => void) => ReactNode; label?: string; radius?: number }) {
  const { open, openId } = usePop();
  return (
    <m.button
      type="button"
      layoutId={`pop-${id}`}
      transition={SPRING}
      style={{ borderRadius: radius }}
      onClick={() => open({ id, title, render })}
      aria-haspopup="dialog"
      aria-label={label}
      whileTap={{ scale: 0.97 }}
      className={`text-left ${openId === id ? "invisible" : ""} ${className}`}
    >
      {children}
    </m.button>
  );
}
