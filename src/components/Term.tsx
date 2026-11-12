"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { termOf } from "@/lib/glossary";

/** The bottom sheet that explains one word. Opened by tapping a Term or a "?" button. */
function Sheet({ k, onClose }: { k: string; onClose: () => void }) {
  const t = termOf(k);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!t) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t.name}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl border-t border-line2 bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-[18px] font-bold leading-tight">{t.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 flex-none place-items-center rounded-full bg-card2 text-mute">✕</button>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">{t.plain}</p>
        {t.good && <p className="mt-3 rounded-xl bg-brand/10 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink"><b>Is this good? </b>{t.good}</p>}
        {t.from && <p className="mt-3 font-mono text-[11.5px] text-dim">Comes from: {t.from}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** A word that explains itself when tapped. Shown with a dotted underline so it looks tappable. */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = termOf(k);
  if (!t) return <>{children ?? k}</>;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="inline cursor-help border-b border-dotted border-dim bg-transparent p-0 text-inherit [font:inherit]" aria-label={`What does ${t.name} mean?`}>
        {children ?? t.name}
      </button>
      {open && <Sheet k={k} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A small round "?" for a card title. */
export function HelpDot({ k, label }: { k: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const t = termOf(k);
  if (!t) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={label ?? `What does ${t.name} mean?`} className="inline-grid h-5 w-5 flex-none place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-mute active:text-brand">?</button>
      {open && <Sheet k={k} onClose={() => setOpen(false)} />}
    </>
  );
}
