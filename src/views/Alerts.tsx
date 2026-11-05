"use client";

import { useAlerts } from "@/lib/data";
import { Card } from "@/components/ui";

const DOT = { bad: "bg-bad", warn: "bg-yellow-400", good: "bg-good" } as const;
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** Things that need a look, newest first: pages that left Google, new broken pages, a traffic drop, a failed workflow. Quiet when there are none. */
export function AlertsCard({ limit = 8, recentDays, quiet }: { limit?: number; recentDays?: number; quiet?: boolean }) {
  const e = useAlerts();
  if (!e.data) return null;
  const cutoff = recentDays ? Date.now() - recentDays * 864e5 : 0;
  const list = e.data.filter((a) => Date.parse(a.at) >= cutoff).slice(0, limit);
  if (!list.length) {
    return quiet ? null : (
      <Card title="Alerts" note="Nothing needs a look. The Worker checks every night and writes here when a page drops out of Google, a page breaks, Google clicks fall or a workflow fails.">
        <span />
      </Card>
    );
  }
  return (
    <Card title={`Alerts (${list.length})`} note="Checked every night. Add a Telegram bot to the Worker to get these on your phone.">
      <ul className="mt-2">
        {list.map((a) => (
          <li key={a.id} className="flex items-start gap-3 border-t border-line py-2 first:border-t-0">
            <i className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.level]}`} aria-label={a.level} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{a.title}</div>
              {a.detail && <div className="break-words text-[12.5px] text-mute">{a.detail}</div>}
            </div>
            <time className="shrink-0 font-mono text-[11.5px] text-dim" dateTime={a.at}>{ago(a.at)}</time>
          </li>
        ))}
      </ul>
    </Card>
  );
}
