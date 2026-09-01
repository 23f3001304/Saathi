import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { LedgerProvider } from "./ledger/LedgerProvider.tsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/motion.css";
import "./styles/print.css";

// §7.3 — light is primary, unconditionally. The OS preference deliberately
// does NOT get a vote: this app is shown on machines we do not control, and
// a reviewer whose laptop happens to be in dark mode must still see the
// paper-and-ink product rather than a dark console. Dark is opt-in only,
// via an explicit stored choice.
function applyStoredTheme(): void {
  const stored = localStorage.getItem("covenant-theme");
  document.documentElement.dataset.theme = stored === "dark" ? "dark" : "light";
}
applyStoredTheme();

const root = document.getElementById("root");
if (root === null) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <LedgerProvider>
      <App />
    </LedgerProvider>
  </StrictMode>,
);
