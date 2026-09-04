import type { CovenantBounds } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import type { WebFindings } from "./web-listing.js";
import type { WebProgress } from "./web-progress.js";

/** Whether a sign-in is stored for a host - the fact, never the values. */
export interface VaultPresence {
  read(pageUrl: string): Promise<unknown | null>;
}

export interface StateParts {
  readonly browser: BrowserService;
  readonly findings: WebFindings;
  readonly progress: WebProgress;
  readonly vault: VaultPresence | null;
  readonly park: { readonly parked: boolean; readonly reason: string };
}

/**
 * What is true in this app right now, as the model's own read.
 *
 * DECISION: state reaches the model through a tool it calls, not through
 * sentences the shell writes into its prompt. A digest is this host's
 * account of the world at the moment the prompt was built; a tool call is
 * the world at the moment the question is asked, and the model decides when
 * that matters. This is the same reason the catalog is a tool and not a
 * paragraph.
 *
 * DECISION: `sign_in_stored` is a boolean and there is no route from here to
 * a value. The model may know that a sign-in exists - so it can choose
 * web_sign_in over handing back the wheel - and may never know what it is.
 */
export async function appState(parts: StateParts): Promise<Record<string, unknown>> {
  const view = parts.browser.current() === null ? null : parts.browser.view();
  const url = view?.url ?? "";
  return {
    ok: true,
    window: view === null ? null : { url, state: view.state },
    who_drives: driverOf(view),
    covenant: boundsOf(parts.browser.ceiling),
    cards_on_screen: parts.findings.since(0).length,
    basket_seen: parts.progress.carted,
    delivery_filled: parts.progress.filled.length > 0,
    handed_over_for: parts.progress.handedOver,
    checkout_parked: parts.park.parked ? parts.park.reason : null,
    sign_in_stored: await storedFor(parts.vault, url),
  };
}

function driverOf(view: { readonly state: string } | null): string {
  if (view === null) return "no window is open";
  return view.state === "user-drive" ? "the shopper" : "you";
}

/** Whether, never what. */
async function storedFor(
  vault: VaultPresence | null,
  url: string,
): Promise<boolean> {
  if (vault === null || url === "") return false;
  return (await vault.read(url)) !== null;
}

function boundsOf(bounds: CovenantBounds | null): Record<string, unknown> | null {
  return bounds === null
    ? null
    : { signed: true, ceiling_paise: bounds.capPaise, currency: bounds.currency };
}
