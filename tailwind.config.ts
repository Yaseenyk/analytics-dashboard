import type { Config } from "tailwindcss";

// streamerOS "Void & Neon": pure black base, elevated surfaces, cyan + purple brand, white-alpha borders.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        card: "rgb(var(--card-rgb) / <alpha-value>)",
        card2: "rgb(var(--card2-rgb) / <alpha-value>)",
        line: "var(--line)",
        line2: "var(--line2)",
        ink: "var(--text)",
        mute: "var(--mute)",
        dim: "var(--dim)",
        brand: "rgb(var(--brand-rgb) / <alpha-value>)",
        purple: "rgb(var(--purple-rgb) / <alpha-value>)",
        good: "rgb(var(--good-rgb) / <alpha-value>)",
        bad: "rgb(var(--bad-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: { inset: "inset 0 1px 1px rgba(255,255,255,.05)" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        fadein: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        pulseglow: { "0%,100%": { boxShadow: "0 0 3px rgba(34,197,94,.1)" }, "50%": { boxShadow: "0 0 12px rgba(34,197,94,.55)" } },
      },
      animation: { shimmer: "shimmer 1.6s infinite", fadein: "fadein .25s ease both", pulseglow: "pulseglow 3s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
