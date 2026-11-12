"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildToday, type Attention, type SiteLine } from "@/lib/attention";
import { useAlerts, useGA, useGSC, useHealth, useLive } from "@/lib/data";
import { n } from "@/lib/derive";
import { useFilters } from "@/lib/filters";
import { Delta, Icon, Sk, SkCard } from "@/components/ui";
import { HelpDot } from "@/components/Term";

const DOT: Record<Attention["level"], string> = { bad: "bg-bad", warn: "bg-yellow-400", info: "bg-brand", good: "bg-good" };
const WORD: Record<Attention["level"], string> = { bad: "Problem", warn: "Needs a look", info: "Good to know", good: "Good news" };
const STATE: Record<SiteLine["state"], { label: string; cls: string }> = {
  growing: { label: "Growing", cls: "bg-good/10 text-good" },
  steady: { label: "Steady", cls: "bg-white/5 text-mute" },
  quiet: { label: "Quiet", cls: "bg-yellow-400/10 text-yellow-300" },
  new: { label: "New", cls: "bg-brand/10 text-brand" },
};

function Verdict({ headline, sentences, tone }: { headline: string; sentences: string[]; tone: "good" | "calm" | "warn" }) {
  const ring = tone === "warn" ? "border-yellow-400/30 bg-yellow-400/[.06]" : tone === "good" ? "border-good/30 bg-good/[.06]" : "border-line bg-card";
  const dot = tone === "warn" ? "bg-yellow-400" : tone === "good" ? "bg-good" : "bg-brand";
  return (
    <section className={`animate-fadein rounded-2xl border p-5 ${ring}`} aria-labelledby="verdict-h">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-mute">
        <i className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        Right now
      </div>
      <h2 id="verdict-h" className="mt-2 text-[26px] font-bold leading-tight tracking-tight">{headline}</h2>
      <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-mute">
        {sentences.map((s) => <p key={s} className="m-0">{s}</p>)}
      </div>
    </section>
  );
}

function Items({ items }: { items: Attention[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="att-h">
      <h2 id="att-h" className="h2 mb-2 px-1">What needs you</h2>
      <ul className="space-y-2.5">
        {items.map((a) => (
          <li key={a.id} className="card animate-fadein !p-4">
            <div className="flex items-start gap-3">
              <i className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full ${DOT[a.level]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10.5px] uppercase tracking-wider text-dim">{WORD[a.level]}</div>
                <div className="text-[15px] font-semibold leading-snug">{a.title}</div>
                {a.detail && <p className="m-0 mt-1 text-[13.5px] leading-relaxed text-mute">{a.detail}</p>}
                {a.href && a.cta && (
                  <Link href={a.href} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand/10 px-4 text-[13.5px] font-semibold text-brand active:scale-[.98]">
                    {a.cta}
                    <Icon name="chevron" className="h-4 w-4 -rotate-90" />
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ title, help, value, caption, cur, prev, cmp }: { title: string; help: string; value: string; caption: string; cur: number; prev: number; cmp: boolean }) {
  return (
    <div className="card animate-fadein !p-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] text-mute"><span>{title}</span><HelpDot k={help} /></div>
      <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight">{value}</div>
      <Delta show={cmp} cur={cur} prev={prev} />
      <p className="m-0 mt-1.5 text-[12px] leading-snug text-dim">{caption}</p>
    </div>
  );
}

function Sites({ sites, go }: { sites: SiteLine[]; go: (host: string) => void }) {
  return (
    <section aria-labelledby="sites-h">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h2 id="sites-h" className="h2">Your sites</h2>
        <span className="text-[12.5px] text-dim">Tap one for details</span>
      </div>
      <ul className="space-y-2">
        {sites.map((s) => (
          <li key={s.host}>
            <Link href="/traffic/" onClick={() => go(s.host)} className="card flex items-center gap-3 !p-3.5 transition-colors active:bg-card2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{s.name}</span>
                  <span className={`flex-none rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
                </div>
                <p className="m-0 mt-0.5 text-[13px] leading-snug text-mute">{s.note}</p>
              </div>
              <Icon name="chevron" className="h-4 w-4 flex-none -rotate-90 text-dim" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Today() {
  const f = useFilters();
  const ga = useGA(f.range).data;
  const gsc = useGSC(f.range).data;
  const health = useHealth().data;
  const live = useLive().data;
  const alerts = useAlerts().data;
  const m = useMemo(() => buildToday({ days: ga?.days ?? 28, ga, gsc, health, live, alerts, site: f.site }), [ga, gsc, health, live, alerts, f.site]);

  if (!ga && !gsc) {
    return (
      <>
        <SkCard className="space-y-3"><Sk w={22} h={11} /><Sk w={60} h={26} /><Sk w={90} /><Sk w={70} /></SkCard>
        <SkCard className="space-y-2"><Sk w={40} h={14} /><Sk w={95} /><Sk w={80} /></SkCard>
      </>
    );
  }
  const T = m.totals;
  return (
    <>
      <Verdict headline={m.headline} sentences={m.sentences} tone={m.tone} />
      <Items items={m.items} />
      <section aria-labelledby="num-h">
        <h2 id="num-h" className="h2 mb-2 px-1">The numbers, simply</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Tile title="People" help="people" value={m.ready ? n(T.people) : "–"} caption="Different people who visited." cur={T.people} prev={T.peoplePrev} cmp={f.cmp} />
          <Tile title="Visits" help="visits" value={m.ready ? n(T.visits) : "–"} caption="Times people came (one person can visit more than once)." cur={T.visits} prev={0} cmp={false} />
          <Tile title="From Google" help="clicks" value={n(T.clicks)} caption="People who clicked you in Google search." cur={T.clicks} prev={T.clicksPrev} cmp={f.cmp} />
          <Tile title="Actions" help="leads" value={m.ready ? n(T.leads) : "–"} caption="WhatsApp taps, emails, calls, forms." cur={T.leads} prev={T.leadsPrev} cmp={f.cmp} />
        </div>
      </section>
      {f.site === "all" && <Sites sites={m.sites} go={f.setSite} />}
      <Link href="/help/" className="card flex items-center gap-3 !p-4 text-[14px] active:bg-card2">
        <Icon name="help" className="h-5 w-5 text-brand" />
        <span className="flex-1"><b>Not sure what a word means?</b><span className="block text-[12.5px] text-dim">Impressions, CTR, position, direct… explained simply.</span></span>
        <Icon name="chevron" className="h-4 w-4 -rotate-90 text-dim" />
      </Link>
    </>
  );
}
