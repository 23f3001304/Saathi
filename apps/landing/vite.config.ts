import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// DECISION: port 5199, away from audit-ui's 5173, so the landing page and
// the product can be open side by side while filming the demo.
export default defineConfig({
  plugins: [react()],
  server: { port: 5199 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
