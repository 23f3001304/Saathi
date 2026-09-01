import { loadConfig } from "./config.js";
import { startAgentHost } from "./server-runtime.js";

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

/**
 * The composition root's entry point: load config, build the root, start
 * `node:http` through Hono, install the signal handlers (§2.8).
 *
 * A configuration failure exits before anything is opened — a host that starts
 * and then discovers it has no trust ring is strictly worse than one that
 * refuses to start and says which directory it looked in.
 */
export function main(): void {
  const running = startAgentHost(loadConfig(process.env));
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      void running.shutdown(signal).then(() => {
        process.exit(0);
      });
    });
  }
}

/**
 * `node dist/src/index.js` (the Dockerfile's CMD) runs `main`; an `import` of
 * this module for its exports does not.
 */
if (process.argv[1]?.endsWith("index.js") === true) {
  try {
    main();
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exit(1);
  }
}

export { loadConfig } from "./config.js";
export { buildRoot } from "./composition-root.js";
export type { CompositionRoot } from "./composition-root.js";
export { startAgentHost } from "./server-runtime.js";
export type { RunningAgentHost } from "./server-runtime.js";
export type { ChatBeat, OptionRowData } from "./http/chat-beat.js";
export type { PurchaseResult } from "./purchase/purchase-result.js";
