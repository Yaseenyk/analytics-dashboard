"use client";

import { useEffect, useState } from "react";
import { refreshPulse, usePulseUpdated } from "@/lib/pulse";
import { Icon } from "@/components/ui";

const age = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/**
 * The one place to refresh visitor numbers (the tracker's own data). Opening a screen makes no request: it shows the copy saved in
 * this browser the last time this button was pressed, and this button asks the tracker for new numbers. That keeps the free database allowance
 * (5M rows read a day) safe however many tabs are open.
 */
export default function PulseChip() {
  const at = usePulseUpdated();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 6000);
    return () => clearTimeout(t);
  }, [busy, at]);
  const press = () => { setBusy(true); refreshPulse(); };
  return (
    <section aria-label="Visitor data" className="mt-3 flex min-h-[44px] items-center gap-3 rounded-xl border border-line bg-card px-3 py-1.5">
      <p className="m-0 min-w-0 flex-1 text-[12px] text-mute">
        <i className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${at ? "bg-good" : "bg-yellow-400"}`} aria-hidden="true" />
        Visitors{at ? ` · saved ${age(at)}` : " · nothing saved yet"} <span className="text-dim">· {at ? "nothing updates by itself, press Refresh for new numbers" : "press Refresh to load the numbers"}</span>
      </p>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        aria-label="Refresh visitor numbers"
        className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] font-medium text-mute hover:border-line2 hover:text-ink disabled:opacity-60"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Wait" : "Refresh"}
      </button>
    </section>
  );
}
