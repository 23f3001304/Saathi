export const NEGOTIATION_PHASES = [
  "browsing",
  "quoting",
  "countering",
  "agreed",
  "abandoned",
] as const;

export type NegotiationPhase = (typeof NEGOTIATION_PHASES)[number];

export interface QuoteOffer {
  readonly sku: string;
  readonly totalPaise: number;
  readonly quoteJti: string;
}

export interface NegotiationPolicy {
  /** The signed intent's allowance. The machine will not cross it, ever. */
  readonly capPaise: number;
  readonly maxRounds: number;
}

export interface NegotiationState {
  readonly phase: NegotiationPhase;
  readonly round: number;
  readonly targetPaise: number;
  readonly best: QuoteOffer | null;
  readonly reason: string | null;
}

export type NegotiationEvent =
  | { readonly kind: "quote"; readonly offer: QuoteOffer }
  | { readonly kind: "counter"; readonly targetPaise: number }
  | { readonly kind: "accept" }
  | { readonly kind: "walk_away"; readonly reason: string };

export function initialNegotiation(
  policy: NegotiationPolicy,
  targetPaise: number,
): NegotiationState {
  return {
    phase: "browsing",
    round: 0,
    targetPaise: Math.min(targetPaise, policy.capPaise),
    best: null,
    reason: null,
  };
}

export function isTerminal(state: NegotiationState): boolean {
  return state.phase === "agreed" || state.phase === "abandoned";
}

function onQuote(
  state: NegotiationState,
  offer: QuoteOffer,
): NegotiationState {
  const better = state.best === null || offer.totalPaise < state.best.totalPaise;
  return {
    ...state,
    phase: "quoting",
    best: better ? offer : state.best,
  };
}

/**
 * A counter is clamped to the cap rather than rejected: the model asking for
 * more than the user signed for is a bad suggestion, not a fatal one, and
 * silently clamping keeps the *machine* — not the prompt — the thing that
 * decides what the merchant is ever asked for.
 */
function onCounter(
  state: NegotiationState,
  targetPaise: number,
  policy: NegotiationPolicy,
): NegotiationState {
  const round = state.round + 1;
  if (round > policy.maxRounds) {
    return { ...state, phase: "abandoned", reason: "rounds_exhausted" };
  }
  return {
    ...state,
    phase: "countering",
    round,
    targetPaise: Math.min(targetPaise, policy.capPaise),
  };
}

function onAccept(
  state: NegotiationState,
  policy: NegotiationPolicy,
): NegotiationState {
  if (state.best === null) {
    return { ...state, phase: "abandoned", reason: "nothing_to_accept" };
  }
  if (state.best.totalPaise > policy.capPaise) {
    return { ...state, phase: "abandoned", reason: "exceeds_intent_cap" };
  }
  return { ...state, phase: "agreed", reason: null };
}

/**
 * Terminal states absorb every later event. A model that keeps talking after
 * the machine has walked away does not get to reopen the negotiation.
 */
export function negotiationStep(
  state: NegotiationState,
  event: NegotiationEvent,
  policy: NegotiationPolicy,
): NegotiationState {
  if (isTerminal(state)) {
    return state;
  }
  switch (event.kind) {
    case "quote":
      return onQuote(state, event.offer);
    case "counter":
      return onCounter(state, event.targetPaise, policy);
    case "accept":
      return onAccept(state, policy);
    case "walk_away":
      return { ...state, phase: "abandoned", reason: event.reason };
  }
}
