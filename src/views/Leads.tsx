"use client";

import { COLORS } from "@/lib/config";
import { useMeta } from "@/lib/data";
import { classify, daily, group, n, rep, sum } from "@/lib/derive";
import { Card, Kpi, Sk, SkCard, SkKpi } from "@/components/ui";
import { GaArea, GaTable, WaitingGate, cols2, grid4, useGaMemo } from "./kit";

const DEFAULT_KEYS = ["whatsapp_click", "email_click", "phone_click", "generate_lead", "app_download", "template_download", "agreement_signed", "calculator_use"];

function EventKpis() {
  const meta = useMeta().data;
  const { v } = useGaMemo((ga, site) => {
    const cnt: Record<string, number> = {};
    group(rep(ga, "events"), [1], site).forEach((g) => (cnt[g.k[0]] = g.m[0]));
    return cnt;
  });
  const keys = meta?.keyEvents ?? DEFAULT_KEYS;
  return (
    <div className={grid4}>
      {keys.map((k) => (v ? <Kpi key={k} id={k} title={k.replace(/_/g, " ")} value={n(v[k] || 0)} /> : <SkKpi key={k} spark={false} />))}
    </div>
  );
}

function Funnel() {
  const { v } = useGaMemo((ga, site) => {
    const t = rep(ga, "totals");
    const cnt: Record<string, number> = {};
    group(rep(ga, "events"), [1], site).forEach((g) => (cnt[g.k[0]] = g.m[0]));
    const ses = sum(t, "sessions", site);
    const steps: [string, number][] = [
      ["Visits", ses],
      ["Engaged", sum(t, "engagedSessions", site)],
      ["Leads and clicks", sum(t, "keyEvents", site)],
      ["Leads", cnt.generate_lead || 0],
    ];
    return { ses, steps };
  });
  if (!v) {
    return (
      <SkCard className="space-y-3">
        <Sk w={20} h={14} />
        <Sk h={16} />
        <Sk w={70} h={16} />
        <Sk w={40} h={16} />
      </SkCard>
    );
  }
  return (
    <Card title="Funnel" note="From visit to lead. One visit can have several events.">
      <div className="mt-3 space-y-3">
        {v.steps.map(([nm, val]) => (
          <div key={nm} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
            <span className="text-[12.5px] text-dim">{nm}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-purple" style={{ width: `${Math.min(100, Math.max(1, (100 * val) / (v.ses || 1)))}%` }} />
            </div>
            <b className="font-mono text-[13px]">{n(val)}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Leads() {
  return (
    <WaitingGate>
      <EventKpis />
      <div className={cols2}>
        <Funnel />
        <GaArea title="Leads and clicks per day" build={(ga, site) => daily(rep(ga, "keyEventsDaily"), "eventCount", site).map((s, i) => ({ ...s, color: s.color ?? COLORS[i % COLORS.length] }))} />
        <GaTable
          title="Did they sign up? Leads by first source"
          cols={["First source", "Medium", "Campaign", "Form", "Leads"]}
          bar={4}
          fmt={[0, 0, 0, 0, "n"]}
          note="Counts start from the first lead after the new tracking went live."
          build={(ga, site) => group(rep(ga, "leadsFirstTouch"), [1, 2, 3, 4], site).map((g) => [classify(g.k[0], g.k[1]).name, g.k[1], g.k[2], g.k[3], g.m[0]])}
        />
        <GaTable
          title="Events by first source"
          cols={["Event", "First source", "Medium", "Count"]}
          bar={3}
          fmt={[0, 0, 0, "n"]}
          build={(ga, site) => group(rep(ga, "eventsFirstTouch"), [1, 2, 3], site).map((g) => [g.k[0], classify(g.k[1], g.k[2]).name, g.k[2], g.m[0]])}
        />
        <GaTable
          title="Events by visit source"
          cols={["Event", "Source", "Medium", "Count"]}
          bar={3}
          fmt={[0, 0, 0, "n"]}
          build={(ga, site) => group(rep(ga, "keyEventsBySource"), [1, 2, 3], site).map((g) => [g.k[0], classify(g.k[1], g.k[2]).name, g.k[2], g.m[0]])}
        />
        <GaTable
          title="Which button or link"
          cols={["Event", "Button text", "Count"]}
          bar={2}
          fmt={[0, 0, "n"]}
          build={(ga, site) =>
            group(rep(ga, "ctaText"), [1, 2], site)
              .filter((g) => g.k[1] && g.k[1] !== "(not set)")
              .map((g) => [g.k[0], g.k[1], g.m[0]])
          }
        />
        <GaTable title="Forms" cols={["Event", "Form", "Count"]} bar={2} fmt={[0, 0, "n"]} build={(ga, site) => group(rep(ga, "forms"), [1, 2], site).map((g) => [g.k[0], g.k[1], g.m[0]])} />
        <GaTable title="All events" cols={["Event", "Count", "People"]} bar={1} fmt={[0, "n", "n"]} build={(ga, site) => group(rep(ga, "events"), [1], site).map((g) => [g.k[0], g.m[0], g.m[1]])} />
      </div>
    </WaitingGate>
  );
}
