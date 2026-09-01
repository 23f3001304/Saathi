import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5174, beside the shopper's app on 5173. Two apps, two ports, one
// gateway: this one reaches the gateway by absolute origin exactly as
// audit-ui does, so there is no proxy here either.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: "dist", emptyOutDir: true },
});
