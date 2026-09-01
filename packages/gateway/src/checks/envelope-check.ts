import type { Verdict } from "@covenant/domain";
import {
  categoryDrawPaise,
  drawFits,
  fail,
  pass,
  toIsoTimestamp,
} from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import { envelopeFor } from "../verdict-context.js";
import type { VerdictContext } from "../verdict-context.js";
import {
  envelopeToPass,
  undeclaredEnvelopeToPass,
} from "./to-pass-builders.js";

function categoriesOf(context: VerdictContext): readonly string[] {
  return [...new Set(context.cartLines.map((line) => line.category))];
}

/**
 * Mental accounting. Open reservations are subtracted alongside committed
 * spend, which is what makes a burst of concurrent HNP verifications unable to
 * overshoot a cap: capacity is consumed at verify time, not at capture time
 * (§3.8, §5.2 c).
 *
 * Envelopes are opt-in for supervised spending and mandatory for unsupervised —
 * a cart whose category has no envelope passes with a human present and fails
 * `ENVELOPE_UNDECLARED_HNP` without one.
 */
export class EnvelopeCheck implements VerdictCheck {
  readonly id = "envelope" as const;

  run(context: VerdictContext): Verdict {
    return this.undeclared(context) ?? this.overdrawn(context) ?? pass(this.id);
  }

  private undeclared(context: VerdictContext): Verdict | null {
    if (context.intent.human_present) {
      return null;
    }
    const orphan = categoriesOf(context).find(
      (category) => envelopeFor(context, category) === null,
    );
    return orphan === undefined
      ? null
      : fail(
          this.id,
          "ENVELOPE_UNDECLARED_HNP",
          undeclaredEnvelopeToPass(
            orphan,
            categoryDrawPaise(context.cartLines, orphan),
            toIsoTimestamp(context.now),
          ),
        );
  }

  private overdrawn(context: VerdictContext): Verdict | null {
    for (const category of categoriesOf(context)) {
      const envelope = envelopeFor(context, category);
      const requested = categoryDrawPaise(context.cartLines, category);
      if (envelope !== null && !drawFits(envelope, requested)) {
        return fail(
          this.id,
          "ENVELOPE_EXCEEDED",
          envelopeToPass(envelope, requested, "wait_or_reduce"),
        );
      }
    }
    return null;
  }
}
