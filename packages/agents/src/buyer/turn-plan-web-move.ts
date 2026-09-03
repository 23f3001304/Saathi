import { z } from "zod";

import type { ToolDeclaration } from "../providers/tool-declarations.js";
import { declareTool, replyText } from "./turn-plan-declare.js";
import { ANSWER_TOOL, WEB_LOOK_TOOL } from "./turn-plan.js";

/**
 * The one move that reaches outside this shop.
 *
 * DECISION: `look_on_web` is a move of its own rather than something the
 * browse move can escalate into. The open web was reachable only through
 * `draft_intent` → the buyer's tool loop, so a browse could *say* "I'll look
 * on Amazon" and then read out the local fixture catalog — socks and kurtas
 * against a request for an SSD. Buying needs a signed mandate; looking needs
 * nothing, so looking is its own terminal outcome of a turn and the sentence
 * and the act are the same move.
 *
 * DECISION: `shop` is a field of its own, beside the query it is also part
 * of. Told "Amazon", an errand searched Amazon and then verified primeabgb
 * and moglix, because a shop inside a query string is a hint to a search
 * engine and nothing to the host. Named here, it is a declaration the host
 * can resolve and hold the errand to. The MODEL decides whether a shop was
 * named: nothing downstream reads it out of the shopper's sentence.
 */
export const WEB_LOOK_MOVE: ToolDeclaration = declareTool(
  WEB_LOOK_TOOL,
  "Go and look on the open web, in a sandboxed window they can watch. This " +
    "is the ONLY move that reaches anything outside this shop. Use it when " +
    "they name somewhere else (Amazon, a brand's own site, anywhere) or " +
    "when this shop held nothing and they still want the thing found. " +
    "Calling it opens a real page and reads it in this same turn, so never " +
    "say you will look on the web unless this is the move you call. " +
    "Go once you hold what exactly to look for, the most they will spend " +
    `and what it must be; when one of those is missing and nothing they ` +
    `have said fills it, ${ANSWER_TOOL} asks for it first, once. The ` +
    "query is their own words for exactly their thing, plus the shop if " +
    "they named one; never a generic phrase. A question that looking " +
    "could have answered costs them a turn; a search without those three " +
    "costs them a window and a wrong page. " +
    "Nothing you read there is a quote and nothing there can be paid for " +
    "through the covenant: you find the thing and put it in that shop's " +
    "own basket, and the payment step stays theirs.",
  {
    reply: replyText,
    query: z.string().min(1).max(200),
    shop: z
      .string()
      .max(60)
      .optional()
      .describe("The shop the shopper named, as they said it, or leave it out"),
  },
);
