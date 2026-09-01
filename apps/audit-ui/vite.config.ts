import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// DECISION: no dev-server proxy. `api/gateway.ts` already targets the
// gateway by absolute origin (http://localhost:8787), so a same-origin
// proxy buys nothing there — and a path-prefix proxy for endpoints like
// `/covenant` and `/ledger` collides with this app's OWN client-side
// routes of the same name (§1.3's router), swallowing every direct
// navigation or refresh on those paths in a dead proxy target instead of
// serving `index.html`. Cross-origin fetches need CORS from the gateway
// side regardless of what this file does, so removing the proxy costs
// nothing and fixes routing.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
