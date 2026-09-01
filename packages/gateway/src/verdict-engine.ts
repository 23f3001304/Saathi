import type { TimedVerdict, Tracer } from "@covenant/domain";
import { timed } from "@covenant/domain";

import type { VerdictCheck } from "./verdict-check.js";
import type { VerdictContext } from "./verdict-context.js";

/**
 * Runs every registered check, in registered order, and emits one span each.
 *
 * **No check short-circuits — all eight run, always** (§8.1). The audit
 * instrument stamps eight seals and the demo's whole value is showing *which*
 * one broke and that the others still ran. Checks are total functions over an
 * already-admitted context, so running them on a bad cart is safe, and the
 * cost is microseconds.
 *
 * A new check is a new class plus one line in the composition root's check
 * wiring; this class is never edited.
 */
export class VerdictEngine {
  constructor(
    private readonly checks: readonly VerdictCheck[],
    private readonly tracer: Tracer,
  ) {}

  run(context: VerdictContext): readonly TimedVerdict[] {
    return this.checks.map((check) => this.runOne(check, context));
  }

  private runOne(check: VerdictCheck, context: VerdictContext): TimedVerdict {
    const span = this.tracer.startSpan("gateway.check", { check: check.id });
    const started = performance.now();
    try {
      const verdict = check.run(context);
      span.setAttribute("verdict.outcome", verdict.outcome);
      // A policy rejection is span status `ok` — it is not a system failure.
      span.setStatus("ok");
      return timed(verdict, performance.now() - started);
    } finally {
      span.end();
    }
  }
}
