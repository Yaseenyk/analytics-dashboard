"use client";

import { describeError } from "@/components/Boundary";

/** If a whole screen breaks, say what happened and offer a way out, instead of the browser's blank "Application error". */
export default function ScreenError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl p-6">
      <h1 className="m-0 text-xl font-semibold text-ink">This screen hit a problem</h1>
      <p className="sub break-words">{describeError(error)}</p>
      <p className="sub">The rest of the dashboard is fine. Try again, or reload the page.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={reset} className="min-h-10 rounded-full bg-brand/15 px-4 text-[13.5px] font-semibold text-brand">Try again</button>
        <button type="button" onClick={() => window.location.reload()} className="min-h-10 rounded-full bg-white/[.05] px-4 text-[13.5px] font-semibold text-mute">Reload</button>
      </div>
    </div>
  );
}
