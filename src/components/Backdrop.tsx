/**
 * The page background: soft aurora glows, a fading dot grid and a faint chart line drawn across the bottom.
 * Pure CSS and SVG, fixed behind everything, never takes a click, and holds still for people who ask for reduced motion.
 */
export default function Backdrop() {
  return (
    <div aria-hidden="true" className="backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bd-glow bd-a" />
      <div className="bd-glow bd-b" />
      <div className="bd-glow bd-c" />
      <div className="bd-dots" />
      <svg className="bd-lines" viewBox="0 0 1200 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bd-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#a855f7" stopOpacity="0" />
            <stop offset=".45" stopColor="#a855f7" stopOpacity=".55" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity=".7" />
          </linearGradient>
          <linearGradient id="bd-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity=".14" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 330 C120 320 170 250 260 262 S410 330 500 270 S650 150 750 190 S900 240 980 130 S1120 60 1200 40 L1200 400 L0 400 Z" fill="url(#bd-fill)" />
        <path d="M0 330 C120 320 170 250 260 262 S410 330 500 270 S650 150 750 190 S900 240 980 130 S1120 60 1200 40" fill="none" stroke="url(#bd-stroke)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d="M0 360 C150 350 220 310 330 318 S520 350 640 300 S820 240 930 250 S1110 190 1200 150" fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="bd-rings" viewBox="0 0 400 400">
        {[60, 100, 140, 180].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#22d3ee" strokeOpacity={0.16 - r / 1800} strokeWidth="1" strokeDasharray={r % 80 === 20 ? "2 6" : undefined} />
        ))}
      </svg>
    </div>
  );
}
