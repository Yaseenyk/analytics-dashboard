"use client";

import { LazyMotion, MotionConfig, m } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { DEFAULT_RANGES, PRIMARY_TABS, SITES, TABS } from "@/lib/config";
import { refreshAll, useMeta, useStamp } from "@/lib/data";
import { FiltersProvider, useFilters } from "@/lib/filters";
import { NotificationBell } from "@/views/Alerts";
import { Icon } from "./ui";

const loadMotion = () => import("./motionFeatures").then((r) => r.default);

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  const id = "lg" + useId().replace(/:/g, "");
  return (
    <svg className={`${className} flex-none`} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A855F7" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" stopOpacity=".28" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0E141C" />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity=".08" />
      <polygon className="logo-area" fill={`url(#${id}-a)`} points="6,21.5 11.5,15.5 15,19 20,9.5 23.5,13 26,10 26,25.5 6,25.5" />
      <polyline className="logo-line" pathLength={1} fill="none" stroke={`url(#${id}-l)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" points="6,21.5 11.5,15.5 15,19 20,9.5 23.5,13 26,10" />
      <circle className="logo-glow" cx="26" cy="10" r="4.4" fill="#22D3EE" fillOpacity=".22" />
      <circle className="logo-dot" cx="26" cy="10" r="2.2" fill="#22D3EE" />
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
            <div key={f.site} className="eyebrow head-in">{f.site === "all" ? "All sites" : SITES[f.site]}</div>
            <h1 key={tab.id} className="head-in m-0 truncate text-[21px] font-bold leading-tight tracking-tight">{tab.title}</h1>
            <div className="mt-0.5 hidden text-[12.5px] text-dim sm:block">{tab.id === "live" ? "Last 30 minutes · press refresh for the latest" : tab.id === "tools" ? "Link builder and tracking reference" : span}</div>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 font-mono text-[11.5px] text-dim">
          <span className={`h-[7px] w-[7px] rounded-full ${stamp.live ? "animate-pulseglow bg-good" : "bg-dim"}`} />
          <span className="hidden whitespace-nowrap sm:inline">{stamp.busy ? "Refreshing…" : stamp.live ? `Live${time ? ` · ${time}` : ""}` : "Saved copy · press refresh for live"}</span>
          <NotificationBell />
          <button type="button" onClick={refreshAll} aria-label="Refresh now" title="Fetch fresh data now" className="group grid h-[30px] w-[30px] place-items-center rounded-full bg-card2 text-mute transition-[color,transform] duration-300 hover:rotate-180 hover:text-brand active:scale-90">
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
              <div className="hidden gap-0.5 overflow-x-auto rounded-xl bg-card p-[3px] shadow-inset md:flex">
                {ranges.map((x) => (
                  <button key={x.id} type="button" onClick={() => f.setRange(x.id)} aria-pressed={f.range === x.id} className={`relative whitespace-nowrap rounded-[9px] px-3 py-1.5 transition-colors ${f.range === x.id ? "font-semibold text-brand" : "text-mute hover:text-ink"}`}>
                    {f.range === x.id && <m.span layoutId="range-pill" aria-hidden="true" transition={{ type: "spring", stiffness: 450, damping: 32 }} className="absolute inset-0 rounded-[9px] bg-brand/10" />}
                    <span className="relative">{x.label.replace("Last ", "")}</span>
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

function Nav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const tab = useTab();
  const [flip, setFlip] = useState(0); // bumps on every open/close so the logo plays its animation
  const [more, setMore] = useState(false);
  const primary = TABS.filter((t) => PRIMARY_TABS.includes(t.id));
  const rest = TABS.filter((t) => !PRIMARY_TABS.includes(t.id));
  return (
    <>
      <aside className={`sticky top-0 hidden h-screen flex-col gap-0.5 overflow-hidden border-r border-line p-3 pt-5 lg:flex ${collapsed ? "side-collapsed" : ""}`}>
        <div className="logo-wrap flex items-center gap-2.5 px-[3px] pb-5">
          <m.button
            key={flip}
            type="button"
            onClick={() => { setFlip((x) => x + 1); onToggle(); }}
            aria-label={collapsed ? "Open the sidebar" : "Close the sidebar"}
            title={collapsed ? "Open the sidebar" : "Close the sidebar"}
            className="grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-[10px] outline-none focus-visible:bg-white/10"
            initial={flip ? { rotate: collapsed ? 180 : -180, scale: 0.55 } : false}
            animate={{ rotate: 0, scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 260, damping: 15 }}
          >
            <Logo className="h-[34px] w-[34px]" />
          </m.button>
          <div className="side-hide">
            <b className="block text-[15px]">Analytics</b>
            <span className="text-xs text-dim">Yaseen Khatib</span>
          </div>
        </div>
        <nav aria-label="Sections" className="relative flex flex-col gap-0.5">
          {TABS.map((t, i) => {
            const on = tab.id === t.id;
            const label = t.short === "Leads" ? "Leads and clicks" : t.id === "search" ? "Search (Google)" : t.id === "live" ? "Live now" : t.short;
            return (
              <Link key={t.id} href={t.href} title={collapsed ? label : undefined} style={{ "--i": i } as React.CSSProperties} aria-current={on ? "page" : undefined} className={`nav-item group relative flex h-10 items-center gap-2.5 rounded-[10px] px-[13px] outline-none transition-colors duration-200 focus-visible:bg-white/10 ${on ? "font-semibold text-brand" : "text-mute hover:text-ink"}`}>
                {on && (
                  <m.span layoutId="nav-pill" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }} className="nav-pill absolute inset-0 rounded-[10px] bg-brand/10" />
                )}
                {!on && <span aria-hidden="true" className="absolute inset-0 rounded-[10px] bg-white/[.045] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />}
                <m.span className="nav-ico relative z-10 grid flex-none place-items-center" whileHover={{ scale: 1.28, rotate: -9 }} whileTap={{ scale: 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>
                  <Icon name={t.icon} />
                </m.span>
                <span className="nav-label relative z-10">{label}</span>
              </Link>
            );
          })}
        </nav>
        <FootNote />
      </aside>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {primary.map((t) => (
          <Link key={t.id} href={t.href} aria-current={tab.id === t.id ? "page" : undefined} className={`relative flex flex-col items-center gap-1 py-2 text-[10.5px] ${tab.id === t.id ? "text-brand" : "text-dim"}`}>
            {tab.id === t.id && <m.span layoutId="tab-dot" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 30 }} className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand" />}
            <m.span whileTap={{ scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Icon name={t.icon} /></m.span>
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
                <Link key={t.id} href={t.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-xl bg-card2 px-4 py-3 text-[14px]">
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
      <span className="mb-1.5 flex items-center gap-2 pl-[3px] text-good"><i className="live-dot flex-none" aria-hidden="true" /><span className="side-hide">{stamp.live ? "live" : "synced"}</span></span>
      <div className="side-hide">GA4 + Search Console<br />{stamp.live ? "Fetched live on open" : "Rebuilt every 2 hours"}</div>
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div key={path} className="stagger mt-4 space-y-4">{children}</div>;
}

/** One listener for the whole page: the card under the pointer gets --mx/--my, which its CSS spotlight follows. */
function useSpotlight() {
  useEffect(() => {
    if (window.matchMedia?.("(hover: none)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = (e.target as Element | null)?.closest?.(".card") as HTMLElement | null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
}

export function Shell({ children }: { children: ReactNode }) {
  useSpotlight();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("side-collapsed") === "1"); } catch { /* private window */ }
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("side-collapsed", c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotion} strict>
        <FiltersProvider>
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="shell-grid min-h-screen lg:grid lg:grid-cols-[var(--side)_minmax(0,1fr)]" style={{ "--side": collapsed ? "72px" : "224px" } as React.CSSProperties}>
            <Nav collapsed={collapsed} onToggle={toggle} />
            <main className="min-w-0 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-7 lg:pb-14">
              <Header />
              <Page>{children}</Page>
            </main>
          </div>
        </FiltersProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
