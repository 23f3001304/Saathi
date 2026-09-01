import { z } from "zod";

import type {
  AmendableRule,
  AmendmentChange,
  ProposedAmendment,
} from "./covenant-amendment.js";
import { AMENDABLE_RULES, directionOf } from "./covenant-amendment.js";

const CHANGE = z.object({
  rule: z.string().min(1).max(60),
  scope: z.string().max(80).nullable(),
  from: z.union([z.number(), z.boolean()]).nullable(),
  to: z.union([z.number(), z.boolean()]),
  unit: z.string().max(16).nullable(),
  currency: z.string().length(3).nullable(),
});

/** The `amend_covenant` arguments, as every provider is told about them. */
export const AMENDMENT_ARGS_SHAPE = {
  reply: z.string().min(1).max(600),
  summary: z.string().min(1).max(200),
  changes: z.array(CHANGE).min(1).max(4),
};

const ARGS = z.object(AMENDMENT_ARGS_SHAPE);

type RawChange = z.infer<typeof CHANGE>;

export interface AmendmentContext {
  /** The covenant's own currency. A change stating another one is refused. */
  readonly currency: string;
}

export const DEFAULT_AMENDMENT_CONTEXT: AmendmentContext = { currency: "INR" };

export type AmendmentParse =
  | { readonly ok: true; readonly value: ProposedAmendment }
  | { readonly ok: false; readonly failure: string };

function scopeOf(raw: RawChange): string {
  return (raw.scope ?? "").trim();
}

/** Everything about the change that is not its value. */
function shapeFailure(
  shape: AmendableRule,
  raw: RawChange,
  context: AmendmentContext,
): string | null {
  if (shape.scopeRequired !== scopeOf(raw).length > 0) {
    return "scope_mismatch";
  }
  if (raw.unit !== null && raw.unit !== shape.unit) {
    return "unit_mismatch";
  }
  if (!shape.currency && raw.currency !== null) {
    return "currency_unexpected";
  }
  return raw.currency !== null && raw.currency !== context.currency
    ? "currency_mismatch"
    : null;
}

/**
 * A cap of minus three thousand rupees is not a tighter cap, and a rule that
 * already holds the value being proposed is not a change. Both reach the
 * shopper as "I could not make sense of that" rather than as a proposal.
 */
function valueFailure(shape: AmendableRule, raw: RawChange): string | null {
  if ((shape.kind === "scalar") !== (typeof raw.to === "number")) {
    return "wrong_value_type";
  }
  if (raw.from !== null && typeof raw.from !== typeof raw.to) {
    return "wrong_value_type";
  }
  if (
    typeof raw.to === "number" &&
    !(Number.isSafeInteger(raw.to) && raw.to > 0)
  ) {
    return "not_a_positive_integer";
  }
  return raw.from === raw.to ? "no_change" : null;
}

/** Unit and currency come off the table, never off the model's arguments. */
function changeOf(
  shape: AmendableRule,
  raw: RawChange,
  context: AmendmentContext,
): AmendmentChange {
  const scope = scopeOf(raw);
  return {
    rule: raw.rule,
    scope: scope.length > 0 ? scope : null,
    from: raw.from,
    to: raw.to,
    unit: shape.unit,
    currency: shape.currency ? context.currency : null,
    direction: directionOf(raw.rule, raw.from, raw.to),
  };
}

/**
 * The deterministic floor under the fourth move. The model decides that a turn
 * is a rule instruction and what change it implies; this decides whether the
 * result is admissible enough to put in front of a person with a pen. Nothing
 * that fails here is ever shown as a proposal.
 */
export function parseAmendment(
  args: unknown,
  context: AmendmentContext,
): AmendmentParse {
  const parsed = ARGS.safeParse(args);
  if (!parsed.success) {
    return { ok: false, failure: "malformed_arguments" };
  }
  const changes: AmendmentChange[] = [];
  for (const raw of parsed.data.changes) {
    const shape = AMENDABLE_RULES[raw.rule];
    if (shape === undefined) {
      return { ok: false, failure: "unknown_rule" };
    }
    const failure =
      shapeFailure(shape, raw, context) ?? valueFailure(shape, raw);
    if (failure !== null) {
      return { ok: false, failure };
    }
    changes.push(changeOf(shape, raw, context));
  }
  return {
    ok: true,
    value: { summary: parsed.data.summary.trim(), changes },
  };
}
