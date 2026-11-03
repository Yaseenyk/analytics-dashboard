"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { DEFAULT_RANGES, PRIMARY_TABS, SITES, TABS } from "@/lib/config";
import { refreshAll, useMeta, useStamp } from "@/lib/data";
import { FiltersProvider, useFilters } from "@/lib/filters";
import { Icon } from "./ui";

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  const gid = "lg" + useId().replace(/:/g, "");
  return (
    <svg className={`${className} flex-none`} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <rect x="7" y="17" width="4.4" height="8" rx="1.6" fill="#000" />
      <rect x="13.8" y="12" width="4.4" height="13" rx="1.6" fill="#000" />
      <rect x="20.6" y="7" width="4.4" height="18" rx="1.6" fill="#000" />
    </svg>
  );
}

function useTab() {
  const path = usePathname() || "/";
  return TABS.find((t) => t.href === path || (t.href !== "/" && path.startsWith(t.href))) ?? TABS[0];
}

function Header() {
  const tab = useTab();
  const f = useFilters();
  const meta = useMeta();
  const stamp = useStamp();
  const ranges = meta.data?.ranges ?? DEFAULT_RANGES;
  const r = ranges.find((x) => x.id === f.range) ?? ranges[1];
  const [span, setSpan] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (r.days - 1) * 864e5);
    const fm = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    setSpan(`${fm(start)} – ${fm(end)}${f.cmp ? ` · vs previous ${r.days} days` : ""}`);
  }, [r.days, f.cmp]);
  useEffect(() => {
    setTime(stamp.liveAt ? new Date(stamp.liveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  }, [stamp.liveAt]);

  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-black/90 px-4 pb-3 pt-3.5 backdrop-blur-md sm:-mx-7 sm:px-7">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-9 w-9 lg:hidden" />
          <div className="min-w-0">
            <div className="eyebrow">{f.site === "all" ? "All sites" : SITES[f.site]}</div>
            <h1 className="m-0 truncate text-[21px] font-bold leading-tight tracking-tight">{tab.title}</h1>
            <div className="mt-0.5 hidden text-[12.5px] text-dim sm:block">{tab.id === "live" ? "Last 30 minutes · updates every 30 seconds" : tab.id === "tools" ? "Link builder and tracking reference" : span}</div>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 font-mono text-[11.5px] text-dim">
          <span className={`h-[7px] w-[7px] rounded-full ${stamp.live ? "animate-pulseglow bg-good" : "bg-dim"}`} />
          <span className="hidden whitespace-nowrap sm:inline">{stamp.busy ? "Refreshing…" : stamp.live ? `Live${time ? ` · ${time}` : ""}` : "Published copy"}</span>
          <button type="button" onClick={refreshAll} aria-label="Refresh now" title="Fetch fresh data now" className="grid h-[30px] w-[30px] place-items-center rounded-full border border-line bg-card2 text-mute hover:border-brand/35 hover:text-brand">
            <Icon name="refresh" className={`h-4 w-4 ${stamp.busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {tab.id !== "tools" && (
        <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <select aria-label="Site" value={f.site} onChange={(e) => f.setSite(e.target.value)}>
            <option value="all">All sites</option>
            {Object.entries(SITES).map(([h, nm]) => <option key={h} value={h}>{nm}</option>)}
          </select>
          {tab.id !== "live" && (
            <>
              <select aria-label="Date range" value={f.range} onChange={(e) => f.setRange(e.target.value)} className="md:hidden">
                {ranges.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <div className="hidden gap-0.5 overflow-x-auto rounded-xl border border-line bg-card p-[3px] shadow-inset md:flex">
                {ranges.map((x) => (
                  <button key={x.id} type="button" onClick={() => f.setRange(x.id)} aria-pressed={f.range === x.id} className={`whitespace-nowrap rounded-[9px] border px-3 py-1.5 ${f.range === x.id ? "border-brand/35 bg-brand/10 font-semibold text-brand" : "border-transparent text-mute hover:text-ink"}`}>
                    {x.label.replace("Last ", "")}
                  </button>
                ))}
              </div>
              <label className="inline-flex flex-none cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] text-mute">
                <input type="checkbox" checked={f.cmp} onChange={(e) => f.setCmp(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
                <span className="hidden sm:inline">Compare with previous period</span>
                <span className="sm:hidden">Compare</span>
              </label>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function Nav() {
  const tab = useTab();
  const [more, setMore] = useState(false);
  const primary = TABS.filter((t) => PRIMARY_TABS.includes(t.id));
  const rest = TABS.filter((t) => !PRIMARY_TABS.includes(t.id));
  return (
    <>
      <aside className="sticky top-0 hidden h-screen flex-col gap-0.5 border-r border-line p-3 pt-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2.5 pb-5">
          <Logo className="h-[34px] w-[34px]" />
          <div>
            <b className="block text-[15px]">Analytics</b>
            <span className="text-xs text-dim">Yaseen Khatib</span>
          </div>
        </div>
        <nav aria-label="Sections" className="flex flex-col gap-0.5">
          {TABS.map((t) => (
            <Link key={t.id} href={t.href} aria-current={tab.id === t.id ? "page" : undefined} className={`flex items-center gap-2.5 rounded-[10px] border px-2.5 py-[9px] ${tab.id === t.id ? "border-brand/35 bg-brand/10 font-semibold text-brand" : "border-transparent text-mute hover:bg-card2 hover:text-ink"}`}>
              <Icon name={t.icon} />
              {t.short === "Leads" ? "Leads and clicks" : t.id === "search" ? "Search (Google)" : t.id === "live" ? "Live now" : t.short}
            </Link>
          ))}
        </nav>
        <FootNote />
      </aside>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {primary.map((t) => (
          <Link key={t.id} href={t.href} aria-current={tab.id === t.id ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2 text-[10.5px] ${tab.id === t.id ? "text-brand" : "text-dim"}`}>
            <Icon name={t.icon} />
            {t.short}
          </Link>
        ))}
        <button type="button" onClick={() => setMore(true)} className={`flex flex-col items-center gap-1 py-2 text-[10.5px] ${rest.some((t) => t.id === tab.id) ? "text-brand" : "text-dim"}`}>
          <Icon name="more" />
          More
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line2 bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="grid gap-1.5">
              {rest.map((t) => (
                <Link key={t.id} href={t.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-xl border border-line bg-card2 px-4 py-3 text-[14px]">
                  <Icon name={t.icon} />
                  {t.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FootNote() {
  const stamp = useStamp();
  return (
    <div className="mt-auto p-2.5 font-mono text-[11.5px] leading-relaxed text-dim">
      GA4 + Search Console
      <br />
      {stamp.live ? "Fetched live on open" : "Rebuilt every 2 hours"}
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div key={path} className="mt-4 animate-fadein space-y-4">{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <FiltersProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
        <Nav />
        <main className="min-w-0 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-7 lg:pb-14">
          <Header />
          <Page>{children}</Page>
        </main>
      </div>
    </FiltersProvider>
  );
}
