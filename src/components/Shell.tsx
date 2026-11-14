"use client";

import { LazyMotion, MotionConfig, m } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEFAULT_RANGES, GROUPS, SITES, TABS, tabsOf } from "@/lib/config";
import { useMeta, useStamp } from "@/lib/data";
import { FiltersProvider, useFilters } from "@/lib/filters";
import { GA_NEEDS, GSC_TABS } from "@/lib/sections";
import SavedChips from "@/components/SavedChips";
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

const CHIP = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card pl-3 pr-2.5 text-[13px] font-medium text-ink hover:border-line2";
/** A list of choices shown in an animated popup. Picking one closes it. */
function Choices({ value, options, onPick }: { value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {options.map(([v, l]) => (
        <li key={v}>
          <button type="button" onClick={() => onPick(v)} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-[15px] ${value === v ? "bg-brand/10 font-semibold text-brand" : "bg-white/[.04] text-ink active:bg-white/[.08]"}`}>
            {l}
            {value === v && <Icon name="check" className="h-5 w-5" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Updated 5 min ago", always visible (on a phone it used to be hidden). Tapping it fetches fresh numbers. */
/** The other screens in the same group, one tap apart, so related things are not hidden behind a menu. */
function Sections() {
  const tab = useTab();
  const list = tabsOf(tab.group);
  if (list.length < 2) return null;
  return (
    <nav aria-label="In this section" className="-mx-5 mt-4 flex gap-1 lg:hidden overflow-x-auto border-b border-line px-5 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {list.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === tab.id ? "page" : undefined} className={`-mb-px flex-none whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${t.id === tab.id ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}>
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
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur-md sm:-mx-7 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-8 w-8 lg:hidden" />
          <div className="min-w-0">
            <h1 key={tab.id} className="m-0 truncate text-[17px] font-semibold leading-tight tracking-tight">{tab.title}</h1>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 font-mono text-[11.5px] text-dim">
          <NotificationBell />
        </div>
      </header>
      <div className="pt-4">
      <div className="text-[13px] leading-snug text-dim">{tab.what}</div>
      {tab.filters !== "none" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
              <div className="hidden gap-0.5 overflow-x-auto rounded-lg border border-line bg-card p-[3px] md:flex">
                {ranges.map((x) => (
                  <button key={x.id} type="button" onClick={() => f.setRange(x.id)} aria-pressed={f.range === x.id} className={`relative whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition-colors ${f.range === x.id ? "font-medium text-ink" : "text-mute hover:text-ink"}`}>
                    {f.range === x.id && <m.span layoutId="range-pill" aria-hidden="true" transition={{ type: "spring", stiffness: 450, damping: 32 }} className="absolute inset-0 rounded-md bg-white/[.09]" />}
                    <span className="relative">{x.label.replace("Last ", "")}</span>
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-1.5">
                <button type="button" role="switch" aria-checked={f.cmp} onClick={() => f.setCmp(!f.cmp)} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors ${f.cmp ? "border-brand/30 bg-brand/10 text-ink" : "border-line bg-card text-mute hover:border-line2"}`}>
                  <span className={`relative h-[16px] w-[28px] rounded-full transition-colors ${f.cmp ? "bg-brand" : "bg-white/20"}`}><i className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-bg transition-all ${f.cmp ? "left-[14px]" : "left-[2px]"}`} /></span>
                  Compare
                </button>
                <span className="hidden sm:inline-flex"><HelpDot k="compare" /></span>
              </span>
            </>
          )}
        </div>
      )}
      {tab.filters === "all" && <div className="mt-2 hidden truncate text-[12px] text-dim sm:block">{span}</div>}
      <Sections />
      {(GA_NEEDS[tab.id] || GSC_TABS.has(tab.id) || tab.id === "live") && <SavedChips tab={tab.id} />}
      </div>
    </>
  );
}

const NAV_SECTIONS: [string, string[]][] = [
  ["Reports", ["home", "visitors", "sources", "pages", "audience", "leads", "live"]],
  ["Search and ads", ["search", "bing", "clarity", "rankings", "ads"]],
  ["Manage", ["fix", "jobs", "tools", "help"]],
];

function Nav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const tab = useTab();
  const [flip, setFlip] = useState(0); // bumps on every open/close so the logo plays its animation
  const [more, setMore] = useState(false);
  const rest = tabsOf("more");
  return (
    <>
      <aside className={`sticky top-0 hidden h-screen flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-r border-line bg-card/50 p-3 pt-5 lg:flex ${collapsed ? "side-collapsed" : ""}`}>
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
                        transition={{ type: "spring", stiffness: 260, damping: 15 }}
          >
            <Logo className="h-[34px] w-[34px]" />
          </m.button>
          <div className="side-hide">
            <b className="block text-[14px] font-semibold">Analytics</b>
            <span className="text-[12px] text-dim">Yaseen Khatib</span>
          </div>
        </div>
        <nav aria-label="Sections" className="relative flex flex-col">
          {NAV_SECTIONS.map(([heading, ids], si) => (
            <div key={heading} className={si ? "mt-4" : ""}>
              <div className="side-hide px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-dim">{heading}</div>
              <div className="flex flex-col gap-0.5">
                {ids.map((id) => {
                  const t = TABS.find((x) => x.id === id);
                  if (!t) return null;
                  const on = tab.id === t.id;
                  const label = t.id === "visitors" ? "All numbers" : t.short;
                  return (
                    <Link key={t.id} href={t.href} title={collapsed ? t.title : undefined} aria-current={on ? "page" : undefined} className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] outline-none transition-colors duration-150 ${on ? "bg-white/[.07] font-medium text-ink" : "text-mute hover:bg-white/[.04] hover:text-ink"}`}>
                      {on && <span aria-hidden="true" className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-brand" />}
                      <span className={`relative z-10 grid flex-none place-items-center ${on ? "text-brand" : ""}`}><Icon name={t.icon} className="h-[17px] w-[17px]" /></span>
                      <span className="nav-label relative z-10">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <FootNote />
      </aside>

      <div className="z-40 flex-none border-t border-line bg-card px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1.5 max-lg:order-2 lg:hidden">
      <nav aria-label="Main" className="grid grid-cols-4 gap-1">
        {GROUPS.map((g) => {
          const on = tab.group === g.id;
          const cls = `relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium ${on ? "text-brand" : "text-dim"}`;
          const inner = (
            <>
              <span aria-hidden="true" className={`absolute inset-0 rounded-lg transition-colors duration-200 ${on ? "bg-brand/10" : ""}`} />
              <m.span className="relative z-10 grid place-items-center" whileTap={{ scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Icon name={g.icon} className="h-[21px] w-[21px]" /></m.span>
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
                <Link key={t.id} href={t.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-lg border border-line bg-card2 px-4 py-3 text-[14.5px]">
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
    <div className="mt-auto p-2.5 text-[11.5px] leading-relaxed text-dim">
      <span className="mb-1.5 flex items-center gap-2 pl-[3px] text-good"><i className="live-dot flex-none" aria-hidden="true" /><span className="side-hide">{stamp.live ? "live" : "synced"}</span></span>
      <div className="side-hide">GA4 + Search Console<br />Saved copy</div>
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div key={path} className="stagger mt-5 space-y-4">{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
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
