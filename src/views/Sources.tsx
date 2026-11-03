"use client";

import { CAT_COLOR, COLORS } from "@/lib/config";
import { classify, group, pct, rep, sourcesAgg } from "@/lib/derive";
import { GaDonut, GaTable, WaitingGate, cols2 } from "./kit";

export default function Sources() {
  return (
    <WaitingGate>
      <div className={cols2}>
        <GaDonut
          title="By type of source"
          colorOf={(nm, i) => CAT_COLOR[nm] || COLORS[i % COLORS.length]}
          build={(ga, site) => {
            const cats: Record<string, number> = {};
            sourcesAgg(ga, site).forEach((x) => (cats[x.cat] = (cats[x.cat] || 0) + x.sessions));
            return Object.keys(cats).map((k) => [k, cats[k]] as [string, number]).sort((a, b) => b[1] - a[1]);
          }}
        />
        <GaTable
          title="AI assistants"
          cols={["Assistant", "Visits", "People", "Leads and clicks"]}
          bar={1}
          fmt={[0, "n", "n", "n"]}
          note="Visits from a link inside ChatGPT, Perplexity, Claude, Gemini and similar."
          empty="No visits from ChatGPT, Perplexity, Claude or Gemini in this period."
          build={(ga, site) => sourcesAgg(ga, site).filter((x) => x.cat === "AI assistants").map((x) => [x.name, x.sessions, x.users, x.key])}
        />
        <GaTable
          title="Who sent your visitors"
          cols={["Source", "Type", "Visits", "People", "New people", "Leads and clicks", "Share"]}
          bar={2}
          sort={2}
          fmt={[0, 0, "n", "n", "n", "n", "p"]}
          max={12}
          note="Grouped by name: search engines, social, AI assistants, communities and other sites."
          build={(ga, site) => {
            const src = sourcesAgg(ga, site);
            const tot = src.reduce((s, x) => s + x.sessions, 0);
            return src.map((x) => [x.name, x.cat, x.sessions, x.users, x.newU, x.key, pct(x.sessions, tot)]);
          }}
        />
        <GaTable
          title="Pages that linked to you"
          cols={["Referring page", "Views", "People"]}
          bar={1}
          fmt={[0, "n", "n"]}
          max={12}
          note="The exact page each visit came from, when the browser shares it."
          build={(ga, site) => group(rep(ga, "referrers"), [1], site).filter((g) => g.k[0] && g.k[0] !== "(not set)").map((g) => [g.k[0], g.m[0], g.m[1]])}
        />
        <GaTable
          title="Campaigns (UTM and ?ref= tags)"
          cols={["Campaign", "Source / medium", "Visits", "People", "Leads and clicks"]}
          bar={2}
          fmt={[0, 0, "n", "n", "n"]}
          empty="No tagged campaigns yet. Build links on the Tools tab, or add ?ref=whatsapp to shared links."
          build={(ga, site) =>
            group(rep(ga, "campaigns"), [1, 2], site)
              .filter((g) => g.k[0] !== "(not set)" && g.k[0] !== "(direct)")
              .map((g) => [g.k[0], g.k[1], g.m[0], g.m[1], g.m[2]])
          }
        />
        <GaTable
          title="Where new people first came from"
          cols={["First source", "Medium", "Campaign", "New people", "Leads and clicks"]}
          bar={3}
          fmt={[0, 0, 0, "n", "n"]}
          note="First touch: what brought a person the first time, not the latest visit."
          build={(ga, site) => group(rep(ga, "firstTouch"), [1, 2, 3], site).map((g) => [classify(g.k[0], g.k[1]).name, g.k[1], g.k[2], g.m[0], g.m[2]])}
        />
        <GaDonut title="Google Analytics channels" build={(ga, site) => group(rep(ga, "channels"), [1], site).map((x) => [x.k[0], x.m[0]] as [string, number])} />
        <GaTable
          title="UTM content and term"
          cols={["Content", "Term", "Visits", "Leads and clicks"]}
          fmt={[0, 0, "n", "n"]}
          empty="No utm_content or utm_term traffic yet."
          build={(ga, site) =>
            group(rep(ga, "campaignContent"), [1, 2], site)
              .filter((g) => g.k[0] !== "(not set)" || g.k[1] !== "(not set)")
              .map((g) => [g.k[0], g.k[1], g.m[0], g.m[1]])
          }
        />
      </div>
    </WaitingGate>
  );
}
