import type { Hono } from "hono";
import { z } from "zod";

import type { CovenantEdits } from "../covenant/amend-bounds.js";
import { unknownPredicates } from "../covenant/amend-bounds.js";
import type { AmendFlow } from "../covenant/amend-flow.js";
import { AmendRejected } from "../covenant/amend-flow.js";
import type { AppContext, AppEnv } from "./app-env.js";

const amendRequest = z.object({
  description: z.string().min(1).max(400),
  bounds: z
    .array(
      z.object({
        predicate: z.string().min(1).max(64),
        value: z.union([z.number(), z.boolean(), z.string().max(200)]),
      }),
    )
    .default([]),
  envelopes: z
    .array(
      z.object({
        category: z.string().min(1).max(64),
        cap_paise: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  merchants: z.array(z.string().min(1).max(200)).default([]),
  skus: z.array(z.string().min(1).max(200)).default([]),
  blackout: z
    .object({
      tz: z.string().min(1).max(64),
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .nullish(),
});

function editsOf(parsed: z.infer<typeof amendRequest>): CovenantEdits {
  return {
    bounds: parsed.bounds,
    envelopes: parsed.envelopes.map((envelope) => ({
      category: envelope.category,
      capPaise: envelope.cap_paise,
    })),
    merchants: parsed.merchants,
    skus: parsed.skus,
    ...(parsed.blackout === undefined ? {} : { blackout: parsed.blackout }),
  };
}

function empty(edits: CovenantEdits): boolean {
  return (
    edits.bounds.length === 0 &&
    edits.envelopes.length === 0 &&
    edits.merchants.length === 0 &&
    edits.skus.length === 0 &&
    edits.blackout === undefined
  );
}

async function amend(context: AppContext, flow: AmendFlow): Promise<Response> {
  const parsed = amendRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const edits = editsOf(parsed.data);
  if (empty(edits)) {
    return context.json({ ok: false, reason_code: "NOTHING_TO_SIGN" }, 400);
  }
  // A predicate this host cannot apply is refused by name rather than dropped.
  // Silently discarding an edit is the failure this whole route exists to end.
  const unknown = unknownPredicates(edits);
  if (unknown.length > 0) {
    return context.json(
      { ok: false, reason_code: "UNKNOWN_CONSTRAINT", predicates: unknown },
      400,
    );
  }
  return await seal(context, flow, edits, parsed.data.description);
}

async function seal(
  context: AppContext,
  flow: AmendFlow,
  edits: CovenantEdits,
  description: string,
): Promise<Response> {
  try {
    const result = await flow.seal(edits, description);
    return context.json(
      {
        ok: true,
        mandate_id: result.mandateId,
        committed_constraints: result.constraintIds,
        refused: result.refused,
      },
      200,
    );
  } catch (cause) {
    if (cause instanceof AmendRejected) {
      return context.json(
        { ok: false, reason_code: cause.reasonCode, human: cause.message },
        409,
      );
    }
    throw cause;
  }
}

/**
 * `POST /covenant/amend` is the Rules screen's hold-to-seal, and it is the only
 * thing behind it. The screen used to clear its own drafts and call a stub, so
 * the ceremony completed and the ledger never heard: the count went to zero,
 * the kolam drew, and a reload showed the old rules. Signing happens here
 * because the browser holds no user key — the hold is the consent, the ring is
 * the authority, and neither is any use without the other.
 */
export function registerCovenantAmend(
  app: Hono<AppEnv>,
  flow: AmendFlow,
): void {
  app.post("/covenant/amend", (context) => amend(context, flow));
}
