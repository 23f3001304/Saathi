import type {
  CanonicalConstraint,
  IntentMandate,
  IsoTimestamp,
} from "@covenant/domain";
import { canonicalConstraintsOf, toIsoTimestamp } from "@covenant/domain";
import type { CovenantSignResponse } from "@covenant/gateway";

import type { CompositionRoot } from "../../composition-root.js";

/** §6.2: the bounds the ledger event records, verbatim under their VC keys. */
const BOUND_KEYS = [
  "allowance",
  "merchants",
  "skus",
  "requires_refundability",
  "user_cart_confirmation_required",
  "human_present",
  "intent_expiry",
  "envelopes",
  "cooloff",
  "blackout_hours",
  "credit_policy",
  "share_aggregates",
] as const;

function boundsOf(
  intent: IntentMandate,
): Readonly<Record<string, unknown>> {
  const source = intent as unknown as Record<string, unknown>;
  return Object.fromEntries(
    BOUND_KEYS.map((key) => [key, source[key] ?? null]),
  );
}

/**
 * DECISION: the bounds are filed under `domain`'s **canonical** predicates
 * rather than their §6.2 credential keys. Why: R1 keys on `max_amount` /
 * `hold_seconds` / `threshold_paise`, R2 on `merchant` / `sku` / `category`
 * and R5 on the same, while this route used to file `allowance`, `cooloff`,
 * `envelopes`, `merchants` and `skus` — so three of the five contradiction
 * rules had no bound to contradict and were dead against a real covenant.
 * `canonicalConstraintsOf` is the one normalisation both sides share.
 *
 * COMPAT: the ACP `allowance` object is also filed verbatim under its §6.2
 * key, because `apps/agent-host`'s e2e reads the signed cap back through that
 * predicate. Delete this row once that helper reads `max_amount`.
 */
function constraintsOf(intent: IntentMandate): readonly CanonicalConstraint[] {
  return [
    ...canonicalConstraintsOf(intent),
    {
      subject: "user",
      predicate: "allowance",
      content: { allowance: { ...intent.allowance } },
    },
  ];
}

/**
 * `POST /covenant/sign` is the only way a constraint can be created (§9.2), so
 * each bound goes through the **write gate** with the intent JWT as its
 * `user_signed_mandate` signature rather than being inserted directly. The
 * gate then grants P3 from the verified channel — the same path a poisoned
 * catalog line would have to survive, which is the point.
 */
async function commitConstraints(
  root: CompositionRoot,
  intent: IntentMandate,
  jwt: string,
  requestId: string,
  now: IsoTimestamp,
): Promise<readonly string[]> {
  const committed: string[] = [];
  for (const bound of constraintsOf(intent)) {
    const result = await root.memory.writeGate.submit({
      tenantId: intent.tenant_id,
      userId: intent.sub,
      type: "constraint",
      tierClaim: 3,
      content: bound.content,
      sourceChannel: "user_signed_mandate",
      sourceRef: intent.jti,
      sig: jwt,
      subject: bound.subject,
      predicate: bound.predicate,
      tValid: now,
      tInvalid: intent.intent_expiry,
      requestId,
    });
    if (result.memoryId !== null) {
      committed.push(result.memoryId);
    }
  }
  return committed;
}

function rowOf(intent: IntentMandate, jwt: string, eventId: string) {
  return {
    id: intent.jti,
    tenantId: intent.tenant_id,
    kind: "intent" as const,
    vcJwt: jwt,
    jwtHash: intent.jwtHash,
    status: "verified" as const,
    parentId: null,
    memoryDigest: null,
    cartHash: null,
    issuerKid: intent.kid,
    iat: intent.iat,
    exp: intent.exp,
    createdEventId: eventId,
  };
}

/**
 * The ledger append and the `mandates` projection row are one transaction, so
 * the projection is never ahead of the event it is derived from — no side
 * effect without its ledger event (§5.1).
 */
export async function commitIntent(
  root: CompositionRoot,
  intent: IntentMandate,
  jwt: string,
  requestId: string,
): Promise<CovenantSignResponse> {
  const now = toIsoTimestamp(root.clock.now());
  const constraints = await commitConstraints(root, intent, jwt, requestId, now);
  return root.stores.ledger.run("gateway.covenant.sign", () => {
    const event = root.stores.events.append({
      tenant_id: intent.tenant_id,
      actor: "user",
      kind: "intent.signed",
      txn_id: null,
      request_id: requestId,
      mandate_id: intent.jti,
      payload: {
        mandate_id: intent.jti,
        kid: intent.kid,
        bounds: boundsOf(intent),
        constraint_ids: constraints,
      },
    });
    root.stores.mandates.upsert(rowOf(intent, jwt, event.id));
    return {
      ok: true as const,
      mandate_id: intent.jti,
      committed_constraints: [...constraints],
      event_id: event.id,
    };
  });
}
