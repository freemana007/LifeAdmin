import type { DeadlineKind } from "../api";

/** One stroked icon set (24px grid, 1.8 stroke) used everywhere. */
const PATHS = {
  timeline: "M5 6h14M5 12h9M5 18h11",
  plus: "M12 5v14M5 12h14",
  library: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  home: "M4 11l8-6.5 8 6.5V20H4zM10 20v-5h4v5",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  upload: "M6 3h8l4 4v14H6zM14 3v4h4M12 17v-6M9.5 13.5L12 11l2.5 2.5",
  paste: "M8 4h8v3H8zM6 6H5v15h14V6h-1M9 12h6M9 16h4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  copy: "M8 8h11v12H8zM5 16V4h11",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-2",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",
  quote: "M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  heart: "M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.6a4.3 4.3 0 017.5 2.7c0 5.6-7.5 10.2-7.5 10.2z",
  sun: "M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  car: "M5 16.5l1.6-5.2A2 2 0 018.5 10h7a2 2 0 011.9 1.3L19 16.5M4 16.5h16V20H4zM7 20v1.5M17 20v1.5",
  foot: "M9 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 21l2-6 3 2v4M10 15l1-5 3 3 3 1M8 11l3-1",
  rain: "M7 15a4 4 0 01-.6-7.95A5.5 5.5 0 0117 8.5a3.5 3.5 0 01.5 6.5zM9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5",
  link: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  info: "M12 11v5M12 7.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4.2-4.2",
  alert: "M12 8v5M12 16.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  retry: "M20 12a8 8 0 11-2.3-5.6M20 4v5h-5",
  trendUp: "M4 17l6-6 4 4 6-7M14 8h6v6",
  // Deadline kinds
  payment: "M17 7.5A6 6 0 106.5 16M4 11h9M4 14h8",
  renewal: "M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4",
  response: "M10 9L5 13l5 4M5 13h9a5 5 0 015 5v1",
  cancellation_window: "M12 21a9 9 0 100-18 9 9 0 000 18zM9 9l6 6M15 9l-6 6",
  expiry: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9",
  appointment: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 15l2 2 4-4",
  other: "M12 12h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, label, className }: { name: IconName | DeadlineKind; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name as IconName]} />
    </svg>
  );
}
