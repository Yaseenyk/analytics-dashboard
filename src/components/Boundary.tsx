"use client";

import { Component, type ReactNode } from "react";

/** The words shown when something on a screen breaks. They name the problem, so it can be reported and fixed, instead of a blank page. */
export function describeError(e: unknown): string {
  const err = e as { name?: string; message?: string; stack?: string } | null;
  const first = (err?.stack ?? "").split("\n").find((l) => /\bat\b|@/.test(l)) ?? "";
  return `${err?.name ?? "Error"}: ${err?.message ?? String(e)}${first ? ` (${first.trim().slice(0, 140)})` : ""}`;
}

/** Keeps one broken card from taking the whole page down with it. */
export default class Boundary extends Component<{ label: string; children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { try { console.error(`[${this.props.label}]`, error); } catch { /* console is optional */ } }
  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <section role="alert" className="card !p-4">
        <h2 className="m-0 text-[15px] font-semibold text-ink">{this.props.label} hit a problem</h2>
        <p className="sub !mt-2 break-words">{describeError(this.state.error)}</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-2 min-h-9 rounded-full bg-white/[.05] px-3 text-[13px] font-semibold text-mute">Try again</button>
      </section>
    );
  }
}
