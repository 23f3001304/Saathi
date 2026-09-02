import type { ToolOutcome } from "@covenant/agents";
import type { z } from "zod";

import type { WebResult } from "../browser/web-result.js";

/**
 * What a refused browsing call says next. The refusal itself is the
 * classifier's or the pin's; these lines are the way forward, kept apart from
 * the runner so the routing file stays about routing.
 */

/** What to do about a refused basket click. Pay and buy-now belong to the
 *  shopper; the basket control beside them is the errand's whole job. */
export const CART_INSTEAD =
  "That control was refused because it commits money or an account, which " +
  "is the shopper's to press and never yours. The basket control is a " +
  "different button and still yours to press. Do this now, in order: call " +
  "web_read; in its controls find the button whose own text says add to " +
  "cart, add to basket or add to bag (never buy now, never pay); press " +
  "that ref with web_add_to_cart; if that fails once, call web_press with " +
  "that same control's `at` coordinates. Do not conclude the basket " +
  "cannot be filled until web_press has been tried once. Only hand over " +
  "the wheel if the page genuinely needs the shopper: a sign-in, a code, " +
  "a payment.";

/** A sponsored click-tracker is not a page: the one live run that opened
 *  /sspa/click wedged its window in a redirect chain and every read after
 *  it burned the full watchdog. Refused at the tool, so no prompt has to
 *  win this argument. */
export const TRACKER_PATH = /\/(sspa\/click|gp\/slredirect|aax-|adclick|clk\b)/i;

export function trackerLink(url: string): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "tracker_link",
      human:
        "That link is the shop's ad tracker, not a product page. Open the " +
        "listing's own link instead.",
      url,
    }),
    isError: true,
  };
}


/** Refused, and told what to do instead: the errand is about one listing, and
 *  the way back to it is the shop's own search, not another product. */
export function offPin(url: string): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "not_this_product",
      human:
        "That is a different product. This errand is about the one listing " +
        "the shopper tapped: open that listing again, or search this shop " +
        "for it, and nothing else.",
      url,
    }),
    isError: true,
  };
}

export function unreachable(tool: string): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "page_unreachable",
      human:
        "The window stopped answering, so that did not happen. Open a page " +
        "again, or try somewhere else.",
      tool,
    }),
    isError: true,
  };
}


/**
 * Carried back on every page the errand reads, because the instruction it has
 * to still be following when it finally speaks is several thousand tokens of
 * Amazon behind it by then. A live English SSD thread opened its errand in
 * English and reported its findings in Hindi, having read an Indian storefront
 * in between — the rule had not been broken, it had been buried.
 *
 * It names a line in the conversation, never a language: nothing here decides
 * what the shopper speaks, and the page just read is not evidence of it.
 */
export const WRITE_IN =
  "Whatever you say to them, write it in the language of their own lines " +
  "quoted at the top of this errand, not the language of this note, and not " +
  "the language of the page you have just read.";


export function outcomeOf(result: WebResult): ToolOutcome {
  return {
    content: JSON.stringify({ ...result.body, write_in: WRITE_IN }),
    isError: result.isError,
  };
}

export function badArgs(error: z.ZodError): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "bad_arguments",
      issues: error.issues,
    }),
    isError: true,
  };}

export function unknown(tool: string): ToolOutcome {
  return {
    content: JSON.stringify({ ok: false, failure: "unknown_tool", tool }),
    isError: true,
  };
}
