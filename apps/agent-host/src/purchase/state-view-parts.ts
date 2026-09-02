import type { CheckoutState, CovenantState } from "@covenant/agents";

import type { WebListingView } from "../browser/web-listing.js";
import type { CovenantEdits } from "../covenant/amend-bounds.js";
import type { ParkReason } from "./web-pick-park.js";

export type WindowOwner = CheckoutState["window"];

/** Who holds the wheel, as the model may be told. Anything but the two
 *  driving states is no window worth naming. Takes `string` so a caller
 *  holding a `SessionState` or a bare session-state string reads alike;
 *  `observed-block.ts` re-exports this as the one owner of the mapping. */
export function windowOwnerOf(state: string | null): WindowOwner {
  if (state === "agent-drive") return "agent";
  if (state === "user-drive") return "shopper";
  return "none";
}

export interface CheckoutSources {
  readonly park: {
    readonly held: string | null;
    readonly reason: ParkReason;
    readonly parked: boolean;
  };
  readonly progress: {
    readonly carted: boolean;
    readonly handedOver: string | null;
  };
  readonly findings: { find(ref: string): WebListingView | null };
}

/** What this host watched itself put in the basket: the parked card's title,
 *  and only once the click that carted it actually happened. A title alone
 *  would name a thing the shopper is merely looking at as a thing they hold. */
function basketOf(sources: CheckoutSources): string | null {
  const { park, progress } = sources;
  if (!progress.carted || park.held === null) return null;
  return sources.findings.find(park.held)?.title ?? null;
}

/**
 * `null` when there is nothing to say: no park, no basket, no window. A
 * checkout block over nothing would read as a checkout, and the model would
 * answer a question about a step nobody is standing on.
 */
export function checkoutOf(
  sources: CheckoutSources,
  window: WindowOwner,
): CheckoutState | null {
  const { park, progress } = sources;
  if (!park.parked && !progress.carted && window === "none") return null;
  return {
    parked: park.parked ? park.reason : null,
    basket_holds: basketOf(sources),
    window,
    at_payment: progress.handedOver === "payment",
  };
}

export interface GateViews {
  readonly intent: { readonly pending: boolean };
  readonly cart: { readonly pending: boolean };
}

/** The intent gate first: a cart cannot be pending under an unsigned intent. */
export function pendingOf(gates: GateViews): CovenantState["pending_signature"] {
  if (gates.intent.pending) return "intent";
  return gates.cart.pending ? "cart" : null;
}

/** The gateway's own predicates, untranslated: the model reads `max_amount`
 *  as the gateway names it, so what it tells them matches the Rules screen. */
export function covenantOf(
  edits: CovenantEdits,
  pending: CovenantState["pending_signature"],
): CovenantState {
  return {
    bounds: edits.bounds,
    merchants: edits.merchants,
    skus: edits.skus,
    envelopes: edits.envelopes.map((envelope) => ({
      category: envelope.category,
      cap_paise: envelope.capPaise,
    })),
    blackout: edits.blackout ?? null,
    pending_signature: pending,
  };
}
