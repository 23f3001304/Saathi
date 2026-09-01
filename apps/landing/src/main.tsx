import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/tokens.css";
import "./styles/base.css";

const el = document.getElementById("root");
if (el === null) throw new Error("root element missing");

// The built page ships prerendered markup (scripts/prerender.mjs) so it
// reads without JavaScript; hydrate it when it is there, mount fresh in dev.
if (el.firstElementChild !== null) {
  hydrateRoot(
    el,
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
