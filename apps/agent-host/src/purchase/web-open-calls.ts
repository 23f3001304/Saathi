import type { ToolCall, ToolOutcome } from "@covenant/agents";

import type { WebShopper } from "../browser/web-shopper.js";
import type { WebPin } from "./web-pin.js";
import {
  badArgs,
  CART_INSTEAD,
  offPin,
  outcomeOf,
  TRACKER_PATH,
  trackerLink,
} from "./web-tool-guards.js";
import { webOpenArgs, webRefArgs } from "./web-tools.js";

/** The two calls that need more than a parse: a navigation the pin and the
 *  tracker rule both judge, and a basket click whose refusal carries the way
 *  forward. Kept beside the runner so the runner is routing and nothing else. */

export async function openCall(
call: ToolCall,
shopper: WebShopper,
pin: WebPin | null,
): Promise<ToolOutcome> {
  const parsed = webOpenArgs.safeParse(call.args);
  if (!parsed.success) return badArgs(parsed.error);
  if (TRACKER_PATH.test(parsed.data.url)) {
    return trackerLink(parsed.data.url);
  }
  if (pin?.allows(parsed.data.url) === false) {
    return offPin(parsed.data.url);
  }
  return outcomeOf(await shopper.open(parsed.data.url));
}

export async function cartCall(
call: ToolCall,
shopper: WebShopper,
): Promise<ToolOutcome> {
  const parsed = webRefArgs.safeParse(call.args);
  if (!parsed.success) return badArgs(parsed.error);
  const result = await shopper.addToCart(parsed.data.ref);
  if (!result.isError) return outcomeOf(result);
  // A refused basket click is usually the shopper's own control: the model
  // aimed at Buy Now, which only they may press. The refusal was right and
  // said so, but said nothing about what to press instead, so the errand
  // handed over the wheel rather than pressing the basket control beside
  // it. The way forward belongs in the refusal.
  return {
    content: JSON.stringify({
      ...JSON.parse(outcomeOf(result).content),
      next: CART_INSTEAD,
    }),
    isError: true,
  };
}
