import type { Verdict } from "@covenant/domain";
import { fail, pass } from "@covenant/domain";
import { nonceToPass } from "@covenant/mandates";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";

/**
 * T-31 replay. **Advisory only** (§8.3): this check reads the nonce state to
 * diagnose and to build a good `to_pass`; the `INSERT INTO nonces` in the
 * commit phase is what actually enforces single use, and its
 * `PRIMARY KEY (nonce, purpose)` violation maps to this same `NONCE_BURNED`.
 * A read-then-write check would be a TOCTOU hole the moment a second writer
 * exists, so the security property never depends on this class.
 *
 * An identical retry (same key, same payload) is answered by the idempotency
 * resolver at stage 0 and never reaches here.
 */
export class NonceCheck implements VerdictCheck {
  readonly id = "nonce" as const;

  run(context: VerdictContext): Verdict {
    const state = context.nonceState;
    if (state === null) {
      return pass(this.id);
    }
    // Nothing about a foreign tenant's burn is disclosed — not even that it exists.
    return state.tenantId === context.tenantId
      ? fail(this.id, "NONCE_BURNED", nonceToPass(state))
      : fail(this.id, "TENANT_MISMATCH", null);
  }
}
