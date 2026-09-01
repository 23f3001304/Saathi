import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppEnv } from "../app-env.js";

/**
 * §4.9 / ARCHITECTURE §10.4. `/healthz` answers "the process is alive" and
 * nothing else — Docker's restart policy keys on it, and coupling liveness to
 * the database would turn one slow query into a restart loop. `/readyz`
 * answers "this process may be sent a verdict", and is 503 during the drain.
 */
export function registerHealth(app: Hono<AppEnv>, root: CompositionRoot): void {
  const startedAt = root.clock.now().getTime();

  app.get("/healthz", (context) =>
    context.json({
      ok: true,
      uptime_s: Math.floor((root.clock.now().getTime() - startedAt) / 1000),
    }),
  );

  app.get("/readyz", (context) => {
    const report = root.read.readiness.check();
    return context.json(report, report.ok ? 200 : 503);
  });
}
