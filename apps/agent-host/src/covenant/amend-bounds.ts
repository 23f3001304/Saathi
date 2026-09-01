import type {
  BlackoutHours,
  CooloffRule,
  IntentBounds,
  IsoTimestamp,
} from "@covenant/domain";

/**
 * One sealed edit, named by the **gateway's own predicate** and carried in the
 * gateway's own units — paise, seconds, basis points. The Rules screen shows
 * hours and rupees and percent; it converts before it sends, because a
 * cool-off displayed as "24 hours" and signed as 24 seconds would be a covenant
 * nobody agreed to.
 */
export interface BoundEdit {
  readonly predicate: string;
  readonly value: number | boolean | string;
}

export interface EnvelopeEdit {
  readonly category: string;
  readonly capPaise: number;
}

export interface CovenantEdits {
  readonly bounds: readonly BoundEdit[];
  readonly envelopes: readonly EnvelopeEdit[];
  readonly merchants: readonly string[];
  readonly skus: readonly string[];
  /** Quiet hours. A composite, so it travels beside the scalars, not among
   *  them — the same shape envelopes and the scope lists already take. */
  readonly blackout?: BlackoutHours | null;
}

type Applier = (
  bounds: IntentBounds,
  value: BoundEdit["value"],
) => IntentBounds;

function whole(value: BoundEdit["value"], fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function flag(value: BoundEdit["value"], fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cooloffWith(
  bounds: IntentBounds,
  patch: Partial<CooloffRule>,
): IntentBounds {
  const held = bounds.cooloff ?? { threshold_paise: 0, hold_seconds: 0 };
  return { ...bounds, cooloff: { ...held, ...patch } };
}

/**
 * An expiry moves the allowance's own `expires_at` with it. They are two fields
 * of one promise, and `effectiveExpiry` takes the earliest of them — so editing
 * one alone would let the older of the pair silently keep bounding the newer.
 */
function expiryApplier(
  bounds: IntentBounds,
  value: BoundEdit["value"],
): IntentBounds {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return bounds;
  }
  const at = value as IsoTimestamp;
  return {
    ...bounds,
    intent_expiry: at,
    allowance: { ...bounds.allowance, expires_at: at },
  };
}

const APPLIERS: Readonly<Record<string, Applier>> = {
  max_amount: (bounds, value) => ({
    ...bounds,
    allowance: {
      ...bounds.allowance,
      max_amount: whole(value, bounds.allowance.max_amount),
    },
  }),
  intent_expiry: expiryApplier,
  threshold_paise: (bounds, value) =>
    cooloffWith(bounds, {
      threshold_paise: whole(value, bounds.cooloff?.threshold_paise ?? 0),
    }),
  hold_seconds: (bounds, value) =>
    cooloffWith(bounds, {
      hold_seconds: whole(value, bounds.cooloff?.hold_seconds ?? 0),
    }),
  requires_refundability: (bounds, value) => ({
    ...bounds,
    requires_refundability: flag(value, bounds.requires_refundability),
  }),
  human_present: (bounds, value) => ({
    ...bounds,
    human_present: flag(value, bounds.human_present),
  }),
  user_cart_confirmation_required: (bounds, value) => ({
    ...bounds,
    user_cart_confirmation_required: flag(
      value,
      bounds.user_cart_confirmation_required,
    ),
  }),
  share_aggregates: (bounds, value) => ({
    ...bounds,
    share_aggregates: flag(value, bounds.share_aggregates),
  }),
  allow_credit: (bounds, value) => ({
    ...bounds,
    credit_policy: {
      ...bounds.credit_policy,
      allow_credit: flag(value, bounds.credit_policy.allow_credit),
    },
  }),
  max_apr_bps: (bounds, value) => ({
    ...bounds,
    credit_policy: {
      ...bounds.credit_policy,
      max_apr_bps: whole(value, bounds.credit_policy.max_apr_bps),
    },
  }),
};

/** Predicates this host knows how to seal. Anything else is refused by name. */
export function unknownPredicates(edits: CovenantEdits): readonly string[] {
  return edits.bounds
    .map((edit) => edit.predicate)
    .filter((predicate) => APPLIERS[predicate] === undefined);
}

function withEnvelopes(
  bounds: IntentBounds,
  edits: readonly EnvelopeEdit[],
): IntentBounds {
  if (edits.length === 0) return bounds;
  const caps = new Map(edits.map((edit) => [edit.category, edit.capPaise]));
  const kept = bounds.envelopes.map((envelope) => {
    const cap = caps.get(envelope.category);
    caps.delete(envelope.category);
    return cap === undefined ? envelope : { ...envelope, cap_paise: cap };
  });
  const added = [...caps].map(([category, cap_paise]) => ({
    category,
    period: "month" as const,
    cap_paise,
  }));
  return { ...bounds, envelopes: [...kept, ...added] };
}

/** `null` means "any", and adding a name to "any" narrows it to that name. */
function widen(
  held: readonly string[] | null,
  added: readonly string[],
): readonly string[] | null {
  if (added.length === 0) return held;
  return [...new Set([...(held ?? []), ...added])];
}

/**
 * The whole bound set, not a patch. `intentSubjectOf` writes every §6.2 key
 * from what it is handed, so a mandate carrying only the edited fields would
 * silently drop the merchant allowlist the moment somebody changed a cool-off.
 */
export function applyEdits(
  base: IntentBounds,
  edits: CovenantEdits,
): IntentBounds {
  const amended = edits.bounds.reduce<IntentBounds>((bounds, edit) => {
    const apply = APPLIERS[edit.predicate];
    return apply === undefined ? bounds : apply(bounds, edit.value);
  }, base);
  return {
    ...withEnvelopes(amended, edits.envelopes),
    merchants: widen(amended.merchants, edits.merchants),
    skus: widen(amended.skus, edits.skus),
    blackout_hours:
      edits.blackout === undefined ? amended.blackout_hours : edits.blackout,
  };
}
