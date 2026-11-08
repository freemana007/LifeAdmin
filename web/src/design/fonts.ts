/**
 * Self-hosted fonts (no third-party requests: GDPR-friendly, and works in the
 * artifact sandbox). Latin subset only: covers English, Irish fadas and €/£.
 * Until they load, the system stacks in tokens.css are used.
 */
import display from "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url";
import body from "@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url";

const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export function loadFonts() {
  if (typeof FontFace === "undefined" || !document.fonts) return;
  const faces = [
    new FontFace("Bricolage Grotesque Variable", `url(${display}) format("woff2")`, { weight: "200 800", unicodeRange: LATIN, display: "swap" }),
    new FontFace("Atkinson Hyperlegible Next Variable", `url(${body}) format("woff2")`, { weight: "200 800", unicodeRange: LATIN, display: "swap" }),
  ];
  for (const f of faces) {
    document.fonts.add(f);
    f.load().catch(() => {
      /* keep the system fallback */
    });
  }
}
