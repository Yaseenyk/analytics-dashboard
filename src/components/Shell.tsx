"use client";

import { LazyMotion, MotionConfig, m } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEFAULT_RANGES, GROUPS, SITES, TABS, tabsOf } from "@/lib/config";
import { refreshAll, useMeta, useStamp } from "@/lib/data";
import { FiltersProvider, useFilters } from "@/lib/filters";
import { NotificationBell } from "@/views/Alerts";
import { Icon } from "./ui";
import { HelpDot } from "./Term";
import { PopBox, PopProvider } from "./Pop";

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

const CHIP = "inline-flex h-10 items-center gap-1 rounded-full bg-card2 pl-3 pr-2.5 text-[13px] font-medium text-ink min-[380px]:gap-1.5 min-[380px]:pl-3.5 min-[380px]:pr-3 min-[380px]:text-[13.5px]";
/** A list of choices shown in an animated popup. Picking one closes it. */
function Choices({ value, options, onPick }: { value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {options.map(([v, l]) => (
        <li key={v}>
          <button type="button" onClick={() => onPick(v)} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-[15px] ${value === v ? "bg-brand/15 font-semibold text-brand" : "bg-white/[.04] text-ink active:bg-white/[.08]"}`}>
            {l}
            {value === v && <Icon name="check" className="h-5 w-5" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Updated 5 min ago", always visible (on a phone it used to be hidden). Tapping it fetches fresh numbers. */
function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
function Fresh() {
  const stamp = useStamp();
  const meta = useMeta();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const at = stamp.liveAt || (meta.data?.generatedAt ? Date.parse(meta.data.generatedAt) : 0);
  const text = stamp.busy ? "Refreshing…" : at ? `Updated ${ago(at)}` : "Loading…";
  return (
    <button type="button" onClick={refreshAll} className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none text-dim active:text-brand" aria-label={`${text}. Tap to refresh.`}>
      <span className={`h-[7px] w-[7px] flex-none rounded-full ${stamp.live ? "animate-pulseglow bg-good" : "bg-dim"}`} aria-hidden="true" />
      {text}
      <Icon name="refresh" className={`h-3 w-3 ${stamp.busy ? "animate-spin" : ""}`} />
    </button>
  );
}

/** The other screens in the same group, one tap apart, so related things are not hidden behind a menu. */
function Sections() {
  const tab = useTab();
  const list = tabsOf(tab.group);
  if (list.length < 2) return null;
  return (
    <nav aria-label="In this section" className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {list.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === tab.id ? "page" : undefined} className={`flex-none whitespace-nowrap rounded-full px-4 py-2.5 text-[13.5px] font-medium transition-colors ${t.id === tab.id ? "bg-brand/15 text-brand" : "bg-card2 text-mute active:bg-white/10"}`}>
          {t.short === "Pages" ? "Top pages" : t.short}
        </Link>
      ))}
    </nav>
  );
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
    <>
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-3 border-b border-white/[.06] bg-black/90 px-5 py-3 backdrop-blur-md sm:-mx-7 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-8 w-8 lg:hidden" />
          <div className="min-w-0">
            <h1 key={tab.id} className="head-in m-0 truncate text-[19px] font-bold leading-tight tracking-tight">{tab.title}</h1>
            <Fresh />
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 font-mono text-[11.5px] text-dim">
          <NotificationBell />
          <button type="button" onClick={refreshAll} aria-label="Refresh now" title="Fetch fresh data now" className="group grid h-[34px] w-[34px] place-items-center rounded-full bg-card2 text-mute transition-[color,transform] duration-300 hover:rotate-180 hover:text-brand active:scale-90">
            <Icon name="refresh" className={`h-4 w-4 ${stamp.busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>
      <div className="pt-3">
      <div className="text-[13px] leading-snug text-mute">{tab.what}</div>
      {tab.filters !== "none" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PopBox id="pick-site" title="Which site?" radius={999} className={CHIP} label="Choose a site" render={(close) => (
            <Choices value={f.site} options={[["all", "All sites"], ...Object.entries(SITES)]} onPick={(v) => { f.setSite(v); close(); }} />
          )}>
            {f.site === "all" ? "All sites" : SITES[f.site]}
            <Icon name="chevron" className="h-4 w-4 text-dim" />
          </PopBox>
          {tab.filters === "all" && (
            <>
              <PopBox id="pick-range" title="How far back?" radius={999} className={`${CHIP} md:hidden`} label="Choose how far back" render={(close) => (
                <Choices value={f.range} options={ranges.map((x) => [x.id, x.label] as [string, string])} onPick={(v) => { f.setRange(v); close(); }} />
              )}>
                {r.label.replace("Last ", "")}
                <Icon name="chevron" className="h-4 w-4 text-dim" />
              </PopBox>
              <div className="hidden gap-0.5 overflow-x-auto rounded-xl bg-card p-[3px] shadow-inset md:flex">
                {ranges.map((x) => (
                  <button key={x.id} type="button" onClick={() => f.setRange(x.id)} aria-pressed={f.range === x.id} className={`relative whitespace-nowrap rounded-[9px] px-3 py-1.5 transition-colors ${f.range === x.id ? "font-semibold text-brand" : "text-mute hover:text-ink"}`}>
                    {f.range === x.id && <m.span layoutId="range-pill" aria-hidden="true" transition={{ type: "spring", stiffness: 450, damping: 32 }} className="absolute inset-0 rounded-[9px] bg-brand/10" />}
                    <span className="relative">{x.label.replace("Last ", "")}</span>
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-1.5">
                <button type="button" role="switch" aria-checked={f.cmp} onClick={() => f.setCmp(!f.cmp)} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors min-[380px]:gap-2 min-[380px]:px-3.5 min-[380px]:text-[13.5px] ${f.cmp ? "bg-brand/15 text-brand" : "bg-card2 text-mute"}`}>
                  <span className={`relative h-[20px] w-[34px] rounded-full transition-colors ${f.cmp ? "bg-brand" : "bg-white/15"}`}><i className={`absolute top-[3px] h-[14px] w-[14px] rounded-full bg-black transition-all ${f.cmp ? "left-[17px]" : "left-[3px]"}`} /></span>
                  Compare
                </button>
                <span className="hidden sm:inline-flex"><HelpDot k="compare" /></span>
              </span>
            </>
          )}
        </div>
      )}
      {tab.filters === "all" && <div className="mt-2 hidden justify-end truncate text-[12px] text-dim sm:flex">{span}</div>}
      <Sections />
      </div>
    </>
  );
}

function Nav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const tab = useTab();
  const [flip, setFlip] = useState(0); // bumps on every open/close so the logo plays its animation
  const [more, setMore] = useState(false);
  const rest = tabsOf("more");
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
            const label = t.title;
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

      <div className="z-40 flex-none bg-black px-3 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 max-lg:order-2 lg:hidden">
      <nav aria-label="Main" className="grid grid-cols-4 gap-1 rounded-[26px] bg-card p-1.5 shadow-[0_6px_30px_rgba(0,0,0,.5)] ring-1 ring-white/10">
        {GROUPS.map((g) => {
          const on = tab.group === g.id;
          const cls = `relative flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium ${on ? "text-brand" : "text-dim"}`;
          const inner = (
            <>
              <span aria-hidden="true" className={`absolute inset-0 rounded-[20px] transition-colors duration-200 ${on ? "bg-brand/15" : ""}`} />
              <m.span className="relative z-10 grid place-items-center" whileTap={{ scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Icon name={g.icon} className="h-[22px] w-[22px]" /></m.span>
              <span className="relative z-10 leading-none">{g.label}</span>
            </>
          );
          return g.id === "more"
            ? <button key={g.id} type="button" onClick={() => setMore(true)} className={cls} aria-haspopup="dialog">{inner}</button>
            : <Link key={g.id} href={g.home} aria-current={on ? "page" : undefined} className={cls}>{inner}</Link>;
        })}
      </nav>
      </div>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line2 bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="grid gap-1.5">
              {rest.map((t) => (
                <Link key={t.id} href={t.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-xl bg-card2 px-4 py-3.5 text-[15px]">
                  <Icon name={t.icon} />
                  <span className="min-w-0"><b className="block font-semibold">{t.title}</b><span className="block text-[12.5px] text-dim">{t.what}</span></span>
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
  const mainRef = useRef<HTMLElement>(null);
  const route = usePathname();
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [route]);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("side-collapsed") === "1"); } catch { /* private window */ }
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("side-collapsed", c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotion} strict>
        <FiltersProvider>
          <PopProvider>
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="shell-grid max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:flex max-lg:h-[100dvh] max-lg:flex-col lg:grid lg:min-h-screen lg:grid-cols-[var(--side)_minmax(0,1fr)]" style={{ "--side": collapsed ? "72px" : "224px" } as React.CSSProperties}>
            <Nav collapsed={collapsed} onToggle={toggle} />
            <main ref={mainRef} className="min-w-0 px-5 pb-8 sm:px-7 max-lg:order-1 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:overscroll-contain lg:pb-14">
              <Header />
              <Page>{children}</Page>
            </main>
          </div>
          </PopProvider>
        </FiltersProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
