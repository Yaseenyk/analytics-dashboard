"use client";

import type { Insights } from "@/lib/pulse";
import { DataTable } from "@/components/DataTable";
import { ago, site } from "./watchkit";

const where = (all: boolean, host: string, path: string) => `${all ? site(host) + " " : ""}${path}`;
const lang = (code: string) => {
  if (!code) return "unknown language";
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code; } catch { return code; }
};
const SINCE = "Recorded from 24 Nov 2026.";

/**
 * Where visitors struggle: the actual script errors, pages read through the browser's translation, taps on things that
 * do nothing, slow responses to taps, layout jumps, forms started and left unsent, and load time by connection type.
 */
export function HealthCards({ ins, all }: { ins: Insights; all: boolean }) {
  const h = ins.health;
  if (!h) return null;
  return (
    <>
      <DataTable
        title="Script errors, with the message"
        note={`What broke, where, and whether the visitor's browser was translating the page (a common cause on React sites). ${SINCE}`}
        cols={["Error", "Times", "Where", "Translated", "Last"]}
        fmt={[0, "n", 0, 0, 0]}
        bar={1}
        max={8}
        empty="No script errors recorded since the message tracking started."
        rows={h.errorMsgs.map((e) => [e.msg, e.n, where(all, e.site, e.path), e.translated ? `${e.translated} of ${e.n}` : "no", ago(e.last)])}
      />
      <DataTable
        title="Taps on things that do nothing"
        note="Real people tapping text, images or empty space, often because it looks clickable. Most tapped first."
        cols={["Element", "Taps", "Where", "Page section"]}
        fmt={[0, "n", 0, 0]}
        bar={1}
        max={8}
        empty="No dead taps by real people in this period."
        rows={h.deadSpots.map((d) => [d.label || "(page)", d.n, where(all, d.site, d.path), d.sec || "–"])}
      />
      <DataTable
        title="Forms started but not sent"
        note={`Someone typed into a form and left without sending it. Only the form's name is recorded, never what was typed. ${SINCE}`}
        cols={["Form", "Left unsent", "Sent", "Where"]}
        fmt={[0, "n", "n", 0]}
        bar={1}
        max={6}
        empty="No forms left half-filled since this started."
        rows={h.formsLeft.map((f) => [f.form, f.left_unsent, f.sent, where(all, f.site, f.path)])}
      />
      <DataTable
        title="Slow responses to a tap"
        note={`Pages where a tap or key press took 200 ms or more to show anything. Over 500 ms feels broken. ${SINCE}`}
        cols={["Where", "Visits", "Worst", "Average"]}
        fmt={[0, "n", 0, 0]}
        bar={1}
        max={6}
        empty="No slow taps recorded since this started."
        rows={h.slowTaps.map((t) => [where(all, t.site, t.path), t.n, `${t.worst} ms`, `${t.avg} ms`])}
      />
      <DataTable
        title="Pages that jump while loading"
        note={`Layout shift of 0.1 or more: content moves under the reader's finger. ${SINCE}`}
        cols={["Where", "Visits", "Jump (CLS)"]}
        fmt={[0, "n", 0]}
        bar={1}
        max={6}
        empty="No layout jumps recorded since this started."
        rows={h.jumps.map((j) => [where(all, j.site, j.path), j.n, (j.cls / 1000).toFixed(2)])}
      />
      <DataTable
        title="Read through the browser's translation"
        note={`Visits where Chrome or another browser translated the page, by language, and how many hit a script error. ${SINCE}`}
        cols={["Language", "Visits", "With an error", "Site"]}
        fmt={[0, "n", "n", 0]}
        bar={1}
        max={6}
        empty="No translated visits recorded since this started."
        rows={h.translated.map((t) => [lang(t.tl), t.visits, t.errored, site(t.site)])}
      />
      <DataTable
        title="Load time by connection"
        note={`Main content load time grouped by the visitor's connection, so a slow network is not mistaken for a slow page. Background tabs are no longer counted. ${SINCE}`}
        cols={["Connection", "Visits", "Average load"]}
        fmt={[0, "n", 0]}
        bar={1}
        max={5}
        empty="No load times with a connection type yet."
        rows={h.speedNet.map((x) => [x.net, x.n, `${(x.lcp / 1000).toFixed(1)} s`])}
      />
    </>
  );
}
