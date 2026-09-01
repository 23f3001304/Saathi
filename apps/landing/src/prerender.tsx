import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";

/** Build-time entry: scripts/prerender.mjs bakes this into dist/index.html. */
export function render(): string {
  return renderToString(<App />);
}
