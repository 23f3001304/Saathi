import type {
  BlackoutHours,
  IntentBounds,
  IsoTimestamp,
} from "@covenant/domain";
import { z } from "zod";

import type { BoundEdit, CovenantEdits } from "./amend-bounds.js";

const constraint = z.object({
  predicate: z.string(),
  content: z.record(z.string(), z.unknown()),
});

const snapshot = z.object({
  constraints: z.array(constraint).default([]),
  envelopes: z
    .array(z.object({ category: z.string(), cap_paise: z.number() }))
    .default([]),
  merchants: z.array(z.string()).default([]),
  skus: z.array(z.string()).default([]),
});

/**
 * What the covenant is *now*, read back in the same predicate vocabulary an
 * edit uses. That symmetry is the point: current state and a proposed change
 * are the same shape, so the one applier table produces both and a field this
 * host can display is by construction a field it can seal.
 */
export async function readCurrent(
  gatewayUrl: string,
  apiVersion: string,
  fetchImpl: typeof fetch,
): Promise<CovenantEdits> {
  const response = await fetchImpl(`${gatewayUrl}/v1/covenant`, {
    headers: { "Request-Id": crypto.randomUUID(), "API-Version": apiVersion },
  });
  if (!response.ok) {
    throw new Error(`GET /v1/covenant → ${response.status}`);
  }
  const raw = snapshot.parse(await response.json());
  return {
    blackout: blackoutOf(raw.constraints),
    bounds: raw.constraints.flatMap(editOf),
    envelopes: raw.envelopes.map((envelope) => ({
      category: envelope.category,
      capPaise: envelope.cap_paise,
    })),
    merchants: raw.merchants,
    skus: raw.skus,
  };
}

const blackoutHours = z.object({
  tz: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

/**
 * Quiet hours come back as a composite, so the scalar reader below cannot see
 * them — and a bound this host can display but not read back is a bound the
 * next seal would silently drop. That is the whole failure being fixed here,
 * so it is worth the extra eight lines rather than the extra bug.
 */
function blackoutOf(
  constraints: readonly z.infer<typeof constraint>[],
): BlackoutHours | null {
  const row = constraints.find((c) => c.predicate === "blackout_hours");
  if (row === undefined) return null;
  const parsed = blackoutHours.safeParse(row.content["value"] ?? row.content);
  return parsed.success ? parsed.data : null;
}

/** `allowance` restates scalars that arrive separately; taking it twice would
 *  let a stale composite overwrite the newer scalar beside it. */
const COMPOSITE = "allowance";

function editOf(raw: z.infer<typeof constraint>): readonly BoundEdit[] {
  if (raw.predicate === COMPOSITE) return [];
  const value = raw.content["value"];
  const usable =
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string";
  return usable ? [{ predicate: raw.predicate, value }] : [];
}

/**
 * The covenant a shopper starts from when the ledger holds no signed intent
 * yet. Deliberately the most restrictive set that is still a covenant: nothing
 * here grants room, so the first seal can only ever narrow or name.
 */
export function baseBounds(
  expiry: IsoTimestamp,
  currency: string,
): IntentBounds {
  return {
    allowance: {
      reason: "one_time",
      max_amount: 0,
      currency,
      expires_at: expiry,
      merchant_id: null,
      checkout_session_id: null,
    },
    merchants: null,
    skus: null,
    requires_refundability: true,
    user_cart_confirmation_required: true,
    human_present: true,
    intent_expiry: expiry,
    envelopes: [],
    cooloff: null,
    blackout_hours: null,
    credit_policy: { allow_credit: false, max_apr_bps: 0 },
    share_aggregates: false,
  };
}
