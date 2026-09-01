import type { CheckId, Verdict } from "@covenant/domain";

import type { VerdictContext } from "./verdict-context.js";

/**
 * A check is a pure, total function over an already-admitted fact bundle
 * (§2.4). It never performs I/O, never throws and always returns exactly one
 * `Verdict` — which is why the engine can run all eight without short
 * circuiting (§8.1) even on a cart that has already failed.
 */
export interface VerdictCheck {
  /** The snake_case wire id the audit UI stamps as a seal (§4.3). */
  readonly id: CheckId;
  run(context: VerdictContext): Verdict;
}
