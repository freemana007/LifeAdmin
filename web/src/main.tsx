import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadFonts } from "./design/fonts";
import "./design/tokens.css";
import "./styles.css";

loadFonts();
// The published demo is wrapped in a host page; make sure screen readers know the language.
if (!document.documentElement.lang) document.documentElement.lang = "en-IE";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
