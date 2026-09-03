import type {
  BrowserSession,
  CovenantBounds,
  Waiter,
} from "@covenant/browser-drive";

import type { KnownAddress } from "./web-address-fill.js";
import { fillKnownAddress } from "./web-address-fill.js";
import { checkCartAgainst } from "./web-cart-check.js";
import type { WebProgress } from "./web-progress.js";
import type { WebResult } from "./web-result.js";

/**
 * The two verbs that work on the shop's own checkout surfaces rather than on
 * the controls a read named: the basket it prints, and the delivery form it
 * asks for. Split from `WebShopper` so that class stays about the window and
 * its refs; the session still arrives from there, so nothing here can reach a
 * page the shopper's own guards did not hand it.
 */

export async function readCart(
  session: BrowserSession,
  ceiling: CovenantBounds | null,
  progress: WebProgress,
): Promise<WebResult> {
  const result = await checkCartAgainst(session, ceiling);
  // The host itself read rows in the shop's basket: that is the carted fact,
  // however the item got there. A press that filled the basket used to leave
  // the record empty and the closing line denied a basket the model had
  // truthfully described.
  const items = result.body["items"];
  if (typeof items === "number" && items > 0) {
    progress.recordCarted();
  }
  return result;
}

/**
 * Fills only the delivery fields this host knows, from `TraitMemory` - what
 * the shopper themselves stated, never the model, never the page. A field with
 * no trait stays blank and is named in the result; a sensitive field is
 * refused, as for every keystroke this path makes.
 */
export function fillDelivery(
  session: BrowserSession,
  address: KnownAddress,
  waiter: Waiter,
  progress: WebProgress,
): Promise<WebResult> {
  return fillKnownAddress(session, address, waiter, (slots) =>
    progress.recordFilled(slots),
  );
}
