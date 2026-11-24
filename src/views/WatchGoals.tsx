"use client";

import { useMemo } from "react";
import type { GoalKey, Goals } from "@/lib/pulse";
import { Card } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { KIND_LABEL, ago, pct, site } from "./watchkit";
import { FEW } from "./WatchDeep";

export const GOAL_LABEL: Record<GoalKey, string> = {
  whatsapp: "WhatsApp tap",
  email: "Email tap",
  phone: "Phone tap",
  form: "Form sent",
  named: "Goal a page reported",
  download: "Download",
  store: "App store click",
  product: "Went to a product site",
  github: "Opened GitHub",
};

const src = (kind: string, host: string) => (host ? `${host} (${KIND_LABEL[kind] ?? kind})` : KIND_LABEL[kind] ?? kind);
const change = (cur: number, prev: number) => (prev ? `${cur >= prev ? "+" : ""}${Math.round((100 * (cur - prev)) / prev)}%` : cur ? "new" : "–");

/**
 * Goals: real people who contacted us (WhatsApp, email, phone, a form) or went on to the product (app store, a product
 * site, GitHub, a download). Read from the clicks the tracker already records, so no site had to change.
 */
/** One headline number: a row on phones (number left, meaning right), a column from the sm breakpoint. */
function Stat({ value, label, note }: { value: string | number; label: string; note: string }) {
  return (
    <div className="flex items-center gap-4 border-t border-white/10 py-3 first:border-t-0 sm:block sm:border-t-0 sm:py-0">
      <dt className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink sm:text-[13px] sm:font-normal sm:text-mute">{label}</span>
        <span className="block text-[12.5px] leading-snug text-dim sm:hidden">{note}</span>
      </dt>
      <dd className="order-first w-16 shrink-0 text-[28px] font-semibold leading-none tabular-nums text-ink sm:mt-1 sm:w-auto">
        {value}
        <span className="mt-1 hidden text-[12.5px] font-normal leading-snug text-dim sm:block">{note}</span>
      </dd>
    </div>
  );
}

export function GoalsCard({ g, all }: { g: Goals; all: boolean }) {
  const total = g.types.reduce((s, t) => s + t.n, 0);
  const prevTotal = g.types.reduce((s, t) => s + t.prevN, 0);
  const people = g.sites.reduce((s, x) => s + x.people, 0);
  const reached = g.sites.reduce((s, x) => s + x.converters, 0);
  const shown = g.types.filter((t) => t.n || t.prevN);
  const top = useMemo(() => (row: Goals["sites"][number]) =>
    (Object.entries(row.byGoal) as [GoalKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${GOAL_LABEL[k]} ${v}`).join(", ") || "–", []);

  return (
    <>
      <Card title="Goals">
        <p className="sub mt-1">
          Contacts, forms, downloads and clicks to your products · last {g.days} days
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-3">
          <Stat value={total} label="Goals reached" note={prevTotal ? `${change(total, prevTotal)} vs the ${g.days} days before` : "No earlier period to compare yet"} />
          <Stat value={reached} label="People who reached one" note={`out of ${people} real people`} />
          <Stat value={`${pct(reached, people)}%`} label="Goal rate" note={people < FEW ? "Too few people to judge yet" : "of real people reached a goal"} />
        </dl>
        {total === 0 && <p className="sub mt-3">No goals yet in this period. Form sends are counted from 19 Nov 2026; the other goals come from clicks recorded since 17 Nov.</p>}
      </Card>
      {shown.length > 0 && (
        <DataTable
          title="Goals by type"
          cols={["Goal", "Times", "People", "Before", "Change"]}
          fmt={[0, "n", "n", "n", 0]}
          bar={1}
          rows={shown.map((t) => [GOAL_LABEL[t.goal], t.n, t.people, t.prevN, change(t.n, t.prevN)])}
        />
      )}
      {all && g.sites.length > 0 && (
        <DataTable
          title="Goals by site"
          note={`Goal rate = real people who reached any goal ÷ real people on that site. Rows marked FEW have under ${FEW} people.`}
          weak={(r) => +r[1]! < FEW}
          cols={["Site", "Real people", "Reached a goal", "Goal rate", "Goals", "Most common"]}
          fmt={[0, "n", "n", "p", "n", 0]}
          bar={4}
          max={13}
          rows={g.sites.map((x) => [site(x.site), x.people, x.converters, x.people ? (100 * x.converters) / x.people : 0, x.goals, top(x)])}
        />
      )}
      {g.pages.length > 0 && (
        <DataTable
          title="Pages where goals happen"
          cols={["Page", "Goal", "Times"]}
          fmt={[0, 0, "n"]}
          bar={2}
          rows={g.pages.map((p) => [`${all ? site(p.site) + " " : ""}${p.path}`, GOAL_LABEL[p.g] ?? p.g, p.n])}
        />
      )}
      {g.sources.length > 0 && (
        <DataTable
          title="Where the people who reached a goal came from"
          note="The first page of their visit."
          cols={["Source", "People", "Goals"]}
          fmt={[0, "n", "n"]}
          bar={1}
          rows={g.sources.map((s) => [src(s.ref_kind, s.ref_host), s.people, s.n])}
        />
      )}
      {g.recent.length > 0 && (
        <DataTable
          title="Latest goals"
          cols={["Goal", "What", "Where", "When"]}
          fmt={[0, 0, 0, 0]}
          rows={g.recent.map((r) => [GOAL_LABEL[r.g] ?? r.g, (r.g === "form" ? r.label.replace(/^form:/, "") : r.label || r.href) || "–", `${all ? site(r.site) + " " : ""}${r.path}`, ago(r.ts)])}
        />
      )}
    </>
  );
}
