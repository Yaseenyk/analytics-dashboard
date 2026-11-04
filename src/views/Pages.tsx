"use client";

import { group, nice, pct, rep, type Group } from "@/lib/derive";

import { GaTable, WaitingGate, cols2 } from "./kit";

/** "/hire" and "/hire/" are one page, and a blank or "(not set)" path means GA4 did not record it. */
const path = (v: string) => (!v || v === "(not set)" ? "Page not recorded" : v.length > 1 && v.endsWith("/") ? v.slice(0, -1) : v);
function merged(gs: Group[], keep: number): Group[] {
  const out = new Map<string, Group>();
  gs.forEach((g) => {
    const k = g.k.map((x, i) => (i < keep ? path(x) : nice(x)));
    const id = k.join("");
    const o = out.get(id);
    if (o) g.m.forEach((v, i) => (o.m[i] += v));
    else out.set(id, { k, m: g.m.slice() });
  });
  return [...out.values()];
}

export default function Pages() {
  return (
    <WaitingGate>
      <div className={cols2}>
        <GaTable
          title="Top pages"
          cols={["Page", "Views", "People", "Time per person", "Leads and clicks"]}
          bar={1}
          fmt={[0, "n", "n", "dur", "n"]}
          max={12}
          build={(ga, site) => merged(group(rep(ga, "pages"), [1], site), 1).map((g) => [g.k[0], g.m[0], g.m[1], g.m[2] / (g.m[1] || 1), g.m[3]])}
        />
        <GaTable
          title="Landing pages (where visits start)"
          cols={["Landing page", "Visits", "Engaged", "Leads and clicks", "Per visit"]}
          bar={1}
          sort={1}
          fmt={[0, "n", "p", "n", "p"]}
          max={12}
          build={(ga, site) => merged(group(rep(ga, "landing"), [1], site), 1).map((g) => [g.k[0], g.m[0], Math.min(100, pct(g.m[1], g.m[0])), g.m[2], pct(g.m[2], g.m[0])])}
        />
        <GaTable
          title="How visitors arrive: landing page by source"
          cols={["Landing page", "Source", "Visits", "Leads and clicks"]}
          bar={2}
          fmt={[0, 0, "n", "n"]}
          max={12}
          note="The entry page, what sent the visitor, and whether it led to a lead or click."
          build={(ga, site) => merged(group(rep(ga, "landingSource"), [1, 2], site), 1).map((g) => [g.k[0], g.k[1] === "not tagged" ? "unknown" : g.k[1], g.m[0], g.m[1]])}
        />
        <GaTable
          title="Pages that lead to leads and clicks"
          cols={["Page", "Event", "Count"]}
          bar={2}
          fmt={[0, 0, "n"]}
          max={12}
          build={(ga, site) => merged(group(rep(ga, "keyEventsByPage"), [2, 1], site), 1).map((g) => [g.k[0], g.k[1], g.m[0]])}
        />
      </div>
    </WaitingGate>
  );
}
