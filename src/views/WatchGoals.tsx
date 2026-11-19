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
          The moments that matter: a real person tapped WhatsApp, email or phone, sent a form, downloaded a file, clicked
          through to an app store, a product site or GitHub. Last {g.days} days, real people only, your own visits left out.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div><p className="sub !mt-0">Goals reached</p><p className="text-2xl font-semibold tabular-nums">{total}</p><p className="sub !mt-0">{change(total, prevTotal)} vs the {g.days} days before</p></div>
          <div><p className="sub !mt-0">People who reached one</p><p className="text-2xl font-semibold tabular-nums">{reached}</p><p className="sub !mt-0">of {people} real people</p></div>
          <div><p className="sub !mt-0">Goal rate</p><p className="text-2xl font-semibold tabular-nums">{pct(reached, people)}%</p><p className="sub !mt-0">{people < FEW ? "too few people to judge yet" : "people who reached a goal"}</p></div>
        </div>
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
