import type { CatalogSku } from "@covenant/agents";

import { asks, askTurn } from "./ask-step.js";
import { listingFor } from "./intent-listing.js";
import { observedFrom } from "./observation.js";
import { lastSentence } from "./prose.js";
import { CORRECTIVE, obeys } from "./language-gate.js";
import { proposeCart, retrieveForCart } from "./propose-step.js";
import { anchorLine, speakFor } from "./web-errand.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";

/**
 * The one path that leads to money: sign the covenant, hold the conversation,
 * resolve the listing the signed intent names, get it quoted, retrieve at
 * `cart-construction`, and propose a cart the intent permits.
 *
 * Every step of it is driven from here rather than from the model. It lives
 * beside `PurchaseRunner` rather than inside it because the runner's subject is
 * *which* move a turn is, and this is what one of those moves does.
 *
 * `stated` is the whole shopper half of the conversation, never the last
 * sentence: "UK 8, refundable" is only a purchase together with the line that
 * said running shoes, and both are memories the digest will bind.
 */
/** One conversation with the buyer, in the shopper's own language. The gate
 *  is the same one the errands stand behind: when the reply disobeys the
 *  anchor line, the model is handed its own answer back with the corrective
 *  and one chance to say it again properly. Live buyers answered an English
 *  kurta request in Hinglish on their first day; scripted ones never could. */
async function conversed(
  parts: RunnerParts,
  stated: readonly string[],
  replyLanguage: string | null,
): Promise<Awaited<ReturnType<RunnerParts["buyer"]["converse"]>>> {
  const prompt = `${stated.join("\n")}\n\n${speakFor(stated, replyLanguage)}`;
  const first = await parts.buyer.converse(prompt);
  const said = first.transcript.join("\n");
  if (obeys(said, replyLanguage, anchorLine(stated))) return first;
  return parts.buyer.converse(`${CORRECTIVE}${prompt}`);
}

export async function buyThrough(
  parts: RunnerParts,
  config: RunnerConfig,
  base: PurchaseResult,
  stated: readonly string[],
  replyLanguage: string | null = null,
): Promise<PurchaseResult> {
  const request = stated.join("\n");
  const intent = await parts.intents.sign(stated);
  const conversation = await conversed(parts, stated, replyLanguage);
  // A purchase turn that ends by asking is waited on like any other; replayed
  // as a bubble and walked past, every later step reasoned from the value it
  // had just said it did not have.
  const asked = lastSentence(conversation.transcript);
  if (asks(asked)) {
    parts.narrator.replay(conversation, asked);
    return askTurn(parts, base, asked);
  }
  parts.narrator.replay(conversation);
  const sku = listingFor(parts.shelf.current(), intent);
  const quote = await parts.fallback.ensureQuote(
    sku,
    intent.bounds.allowance.max_amount,
  );
  const retrieval = await retrieveForCart(parts, config, { sku, quote });
  parts.narrator.present(request);
  const observed = observedFrom(base, {
    intent,
    conversation,
    retrieval,
    writes: parts.log.memoryWrites,
  });
  parts.lastProposal.hold({ intent, conversation, sku: sku.sku });
  return await proposeCart(parts, config, {
    result: observed,
    intent,
    sku,
    quote,
  });
}

/**
 * The cart, rebuilt for the card that was actually tapped. `null` when there
 * is nothing to rebuild: no proposal standing, an unknown sku, or a tap on
 * the sku the cart already holds.
 */
export async function reproposeSku(
  parts: RunnerParts,
  config: RunnerConfig,
  base: PurchaseResult,
  ref: string,
): Promise<PurchaseResult | null> {
  const held = parts.lastProposal.current();
  if (held === null || held.sku === ref) return null;
  const sku = skuIn(parts.shelf.current(), ref);
  if (sku === null) return null;
  parts.cartGate.reset();
  const quote = await parts.fallback.ensureQuote(
    sku,
    held.intent.bounds.allowance.max_amount,
  );
  const retrieval = await retrieveForCart(parts, config, { sku, quote });
  const observed = observedFrom(base, {
    intent: held.intent,
    conversation: held.conversation,
    retrieval,
    writes: parts.log.memoryWrites,
  });
  parts.lastProposal.hold({ ...held, sku: sku.sku });
  return await proposeCart(parts, config, {
    result: observed,
    intent: held.intent,
    sku,
    quote,
  });
}

function skuIn(shelf: readonly CatalogSku[], ref: string): CatalogSku | null {
  return shelf.find((item) => item.sku === ref) ?? null;
}
