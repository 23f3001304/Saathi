import { loadConfig } from "./config.js";
import { startGateway } from "./server-runtime.js";

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

/**
 * The composition root's entry point: load config, build the root, start
 * `node:http` through Hono, install the signal handlers (§2.8).
 *
 * A configuration failure exits before anything is opened — a service that
 * starts and then fails on the first request that needs a missing key is
 * strictly worse than one that refuses to start with a readable report.
 */
export async function main(): Promise<void> {
  const running = await startGateway(loadConfig(process.env));
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
    await main();
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exit(1);
  }
}

export { loadConfig } from "./config.js";
export { startGateway } from "./server-runtime.js";
export type { RunningGateway } from "./server-runtime.js";
