import type { MemoryEntry, ReasonCode, Remedy, Verdict } from "@covenant/domain";
import {
  CART_CONSTRUCTION_TIER_FLOOR,
  MEMORY_DIGEST_ALG,
  fail,
  pass,
  tierAtLeast,
  wasRetiredBefore,
} from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";
import { memoryToPass } from "./to-pass-builders.js";

interface Rule {
  readonly code: ReasonCode;
  readonly remedy: Remedy;
  /** The entries this rule objects to; empty means the rule holds. */
  readonly offenders: (context: VerdictContext) => readonly MemoryEntry[];
}

/**
 * §8.4 check 5, in the order its predicates are listed. Predicates 1–2 are
 * about the digest itself and carry no offending entries; 3–5 name the exact
 * entries, which is what lets the agent re-derive rather than guess.
 */
const RULES: readonly Rule[] = [
  {
    code: "MEMORY_TIER_VIOLATION",
    remedy: "obtain_signed_attestation",
    offenders: (context) =>
      context.memory.entries.filter(
        (entry) =>
          entry.quarantined ||
          !tierAtLeast(entry.tier, CART_CONSTRUCTION_TIER_FLOOR),
      ),
  },
  {
    code: "MEMORY_ENTRY_EXPIRED",
    remedy: "re-derive_digest",
    offenders: (context) =>
      // The agent may not sign over beliefs it had already retired.
      context.memory.entries.filter((entry) =>
        wasRetiredBefore(entry, context.cart.iat),
      ),
  },
  {
    code: "MEMORY_TENANT_MISMATCH",
    remedy: "re-derive_digest",
    offenders: (context) =>
      context.memory.entries.filter(
        (entry) => entry.tenantId !== context.tenantId,
      ),
  },
];

/**
 * PTLM provenance binding. The digest is recomputed from the ids the cart
 * signed over and compared to the signed value; recomputation is
 * order-independent (§9.4), so a reordered id list must still match while a
 * substituted belief must not.
 */
export class MemoryDigestCheck implements VerdictCheck {
  readonly id = "memory_digest" as const;

  run(context: VerdictContext): Verdict {
    return this.digest(context) ?? this.entries(context) ?? pass(this.id);
  }

  private digest(context: VerdictContext): Verdict | null {
    const algorithmPinned = context.cart.memory_digest_alg === MEMORY_DIGEST_ALG;
    const matches =
      context.memory.recomputedDigest === context.cart.memory_digest;
    return algorithmPinned && matches
      ? null
      : fail(
          this.id,
          "MEMORY_DIGEST_MISMATCH",
          memoryToPass(context, "re-derive_digest", []),
        );
  }

  private entries(context: VerdictContext): Verdict | null {
    for (const rule of RULES) {
      const offenders = rule.offenders(context);
      if (offenders.length > 0) {
        const ids = offenders.map((entry) => entry.id);
        return fail(
          this.id,
          rule.code,
          memoryToPass(context, rule.remedy, ids),
        );
      }
    }
    return null;
  }
}
