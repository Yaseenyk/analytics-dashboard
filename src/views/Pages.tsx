"use client";

import { group, pct, rep } from "@/lib/derive";
import { GaTable, WaitingGate, cols2 } from "./kit";

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
          build={(ga, site) => group(rep(ga, "pages"), [1], site).map((g) => [g.k[0], g.m[0], g.m[1], g.m[2] / (g.m[1] || 1), g.m[3]])}
        />
        <GaTable
          title="Landing pages (where visits start)"
          cols={["Landing page", "Visits", "Engaged", "Leads and clicks", "Per visit"]}
          bar={1}
          sort={1}
          fmt={[0, "n", "p", "n", "p"]}
          max={12}
          build={(ga, site) => group(rep(ga, "landing"), [1], site).map((g) => [g.k[0], g.m[0], Math.min(100, pct(g.m[1], g.m[0])), g.m[2], pct(g.m[2], g.m[0])])}
        />
        <GaTable
          title="How visitors arrive: landing page by source"
          cols={["Landing page", "Source", "Visits", "Leads and clicks"]}
          bar={2}
          fmt={[0, 0, "n", "n"]}
          max={12}
          note="The entry page, what sent the visitor, and whether it led to a lead or click."
          build={(ga, site) => group(rep(ga, "landingSource"), [1, 2], site).map((g) => [g.k[0], g.k[1], g.m[0], g.m[1]])}
        />
        <GaTable
          title="Pages that lead to leads and clicks"
          cols={["Page", "Event", "Count"]}
          bar={2}
          fmt={[0, 0, "n"]}
          max={12}
          build={(ga, site) => group(rep(ga, "keyEventsByPage"), [2, 1], site).map((g) => [g.k[0], g.k[1], g.m[0]])}
        />
      </div>
    </WaitingGate>
  );
}
