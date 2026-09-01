import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/motion.css";

// Light is primary, unconditionally, exactly as in the shopper's app: a
// merchant opening this on a machine we do not control still sees the
// paper-and-ink product rather than a dark console.
document.documentElement.dataset["theme"] = "light";

const root = document.getElementById("root");
if (root === null) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
