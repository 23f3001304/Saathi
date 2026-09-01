import { sha256Of } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";

import type { VerifyCartCommand, VerifyCartRequest } from "../src/index.js";
import { GOLDEN_ENTRIES, TENANT, USER_URN } from "./fixtures.js";

export function verifyCartBody(
  intent: IssuedMandate,
  cart: IssuedMandate,
): VerifyCartRequest {
  return {
    cart_mandate_jwt: cart.jwt,
    intent_mandate_jwt: intent.jwt,
    memory_entry_ids: GOLDEN_ENTRIES.map((entry) => entry.id),
    tenant_id: TENANT,
  };
}

/**
 * `payload_hash` is canonical over the parsed body, so key ordering or
 * whitespace cannot manufacture a false idempotency conflict (§4.5).
 */
export function verifyCartCommand(
  intent: IssuedMandate,
  cart: IssuedMandate,
  idempotencyKey: string,
): VerifyCartCommand {
  const body = verifyCartBody(intent, cart);
  return {
    body,
    tenantId: TENANT,
    userId: USER_URN,
    requestId: `req-${idempotencyKey}`,
    idempotencyKey,
    payloadHash: sha256Of(body),
  };
}
