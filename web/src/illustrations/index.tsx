/*
 * Illustration set: one line weight (2.2), rounded joins, brand stroke with soft tinted fills.
 * Colours come from theme tokens, so each piece works in light and dark.
 * Tone rule: calm and warm; never used next to overdue items or tax letters.
 */
const svgProps = { viewBox: "0 0 200 140", className: "illo", "aria-hidden": true, focusable: false } as const;

/** First run: a messy pile of post becoming one tidy, ticked list. */
export function WelcomeArt() {
  return (
    <svg {...svgProps}>
      <ellipse cx="100" cy="128" rx="78" ry="6" className="illo-shadow" />
      <g className="illo-line">
        <rect x="22" y="58" width="58" height="40" rx="4" transform="rotate(-12 51 78)" className="illo-fill-amber" />
        <path d="M24 52l29 20 27-26" transform="rotate(-12 51 78)" />
        <rect x="34" y="74" width="54" height="38" rx="4" transform="rotate(8 61 93)" className="illo-fill-blue" />
        <path d="M44 86h26M44 94h18" transform="rotate(8 61 93)" />
        <path d="M96 84c8-2 12-6 16-12" strokeDasharray="3 6" />
        <rect x="114" y="22" width="66" height="96" rx="10" className="illo-fill-paper" />
        <circle cx="128" cy="44" r="6" className="illo-fill-brand" />
        <path d="M125.5 44l2 2 3.5-4" className="illo-line-inverse" />
        <path d="M140 42h28M140 47h18" />
        <circle cx="128" cy="68" r="6" className="illo-fill-brand" />
        <path d="M125.5 68l2 2 3.5-4" className="illo-line-inverse" />
        <path d="M140 66h24M140 71h20" />
        <circle cx="128" cy="92" r="6" />
        <path d="M140 90h26M140 95h14" />
      </g>
      <circle cx="186" cy="20" r="5" className="illo-accent-amber" />
      <circle cx="14" cy="40" r="4" className="illo-accent-blue" />
      <circle cx="98" cy="28" r="3" className="illo-accent-rose" />
    </svg>
  );
}

/** All caught up: a cup of tea beside a closed, ticked envelope. */
export function CaughtUpArt() {
  return (
    <svg {...svgProps}>
      <ellipse cx="100" cy="126" rx="70" ry="6" className="illo-shadow" />
      <g className="illo-line">
        <rect x="30" y="58" width="76" height="52" rx="6" className="illo-fill-blue" />
        <path d="M32 62l36 26 36-26" />
        <circle cx="96" cy="58" r="14" className="illo-fill-brand" />
        <path d="M89.5 58l4.5 4.5 8-9" className="illo-line-inverse" />
        <path d="M124 78h40v22a16 16 0 01-16 16h-8a16 16 0 01-16-16z" className="illo-fill-amber" />
        <path d="M164 84h6a8 8 0 010 16h-6" />
        <path d="M136 62c-4-6 4-8 0-16M150 64c-4-6 4-8 0-16" className="illo-steam" />
      </g>
      <circle cx="22" cy="40" r="5" className="illo-accent-rose" />
      <circle cx="176" cy="54" r="4" className="illo-accent-blue" />
      <circle cx="112" cy="30" r="3" className="illo-accent-amber" />
    </svg>
  );
}

/** Empty: an open letterbox waiting for the first letter. */
export function EmptyArt() {
  return (
    <svg {...svgProps}>
      <ellipse cx="100" cy="126" rx="64" ry="6" className="illo-shadow" />
      <g className="illo-line">
        <path d="M60 120V64a30 30 0 0160 0v56z" className="illo-fill-violet" />
        <path d="M120 64a30 30 0 0130 30v26h-30" className="illo-fill-paper" />
        <rect x="72" y="70" width="36" height="8" rx="4" className="illo-fill-paper" />
        <path d="M150 70V40h18v12h-18" className="illo-fill-amber" />
        <path d="M128 30l16-10M132 40l20-4" strokeDasharray="2 6" />
      </g>
    </svg>
  );
}

/** Reading: a letter with a gentle scan line (animated in CSS, still under reduced motion). */
export function ReadingArt() {
  return (
    <svg {...svgProps}>
      <ellipse cx="100" cy="128" rx="54" ry="6" className="illo-shadow" />
      <g className="illo-line">
        <path d="M62 14h56l20 20v86H62z" className="illo-fill-paper" />
        <path d="M118 14v20h20" />
        <path d="M76 46h36M76 58h48M76 70h28M76 82h44M76 94h22" />
        <rect x="104" y="90" width="24" height="12" rx="3" className="illo-fill-amber" />
      </g>
      <rect x="56" y="40" width="88" height="3" rx="1.5" className="illo-scan" />
    </svg>
  );
}
