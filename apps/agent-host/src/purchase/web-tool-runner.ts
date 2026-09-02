import type { ToolCall, ToolOutcome } from "@covenant/agents";
import {
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_OPEN_TOOL,
  WEB_READ_TOOL,
  WEB_SEARCH_TOOL,
  WEB_SHOP_TOOLS,
} from "@covenant/agents";
import type { z } from "zod";

import type { WebShopper } from "../browser/web-shopper.js";
import { CALL_CEILING_MS, withinCall } from "./call-ceiling.js";
import type { WebPin } from "./web-pin.js";
import type { WebResult } from "../browser/web-result.js";
import type { StepSink } from "./web-steps.js";
import { stepLabel } from "./web-steps.js";
import { webOpenArgs, webRefArgs, webSearchArgs } from "./web-tools.js";

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
const WRITE_IN =
  "Whatever you say to them, write it in the language of their own lines " +
  "quoted at the top of this errand, not the language of this note, and not " +
  "the language of the page you have just read.";

function outcomeOf(result: WebResult): ToolOutcome {
  return {
    content: JSON.stringify({ ...result.body, write_in: WRITE_IN }),
    isError: result.isError,
  };
}

function badArgs(error: z.ZodError): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "bad_arguments",
      issues: error.issues,
    }),
    isError: true,
  };
}

export function isWebTool(tool: string): boolean {
  return WEB_SHOP_TOOLS.includes(tool);
}

/**
 * The web half of the tool surface, beside `MerchantToolRunner` and shaped the
 * same way: arguments are parsed here rather than cast, and a bad argument is
 * a tool error rather than a throw three layers down inside puppeteer.
 *
 * It runs *after* `PreToolUseHook`, like every other runner. Nothing in this
 * file re-decides whether a call was allowed, and nothing in it can reach a
 * payment rail — the only egress it knows is a DOM behind `GuardedPage`.
 */
export class WebToolRunner {
  constructor(
    private readonly shopper: WebShopper,
    /** Where each move is written down for the shopper to read. Optional so a
     *  test can drive the tools without a hub behind them. */
    private readonly steps: StepSink | null = null,
    /** Overridden only so a test can prove the ceiling without waiting one
     *  out; production never passes it. */
    private readonly ceilingMs: number = CALL_CEILING_MS,
    /** The one product a buy errand may be about; unset for a look. */
    private readonly pin: WebPin | null = null,
  ) {}

  async run(call: ToolCall): Promise<ToolOutcome> {
    const outcome = await this.bounded(call);
    const label = stepLabel(call.tool, call.args, failureOf(outcome));
    if (label !== null) this.steps?.step(label);
    return outcome;
  }

  /**
   * A window that has stopped answering is a tool result, not a hang. The
   * model is told the page is unreachable and reroutes — the same thing it
   * does about any other page that refuses to be read — instead of the errand
   * sitting inside a call that will never come back.
   */
  private async bounded(call: ToolCall): Promise<ToolOutcome> {
    try {
      return await withinCall(this.dispatch(call), call.tool, this.ceilingMs);
    } catch {
      return unreachable(call.tool);
    }
  }

  private async dispatch(call: ToolCall): Promise<ToolOutcome> {
    switch (call.tool) {
      case WEB_OPEN_TOOL:
        return await this.open(call);
      case WEB_READ_TOOL:
        return outcomeOf(await this.shopper.read());
      case WEB_SEARCH_TOOL:
        return await this.search(call);
      case WEB_ADD_TO_CART_TOOL:
        return await this.addToCart(call);
      case WEB_CART_TOOL:
        return outcomeOf(await this.shopper.cart());
      case WEB_FILL_ADDRESS_TOOL:
        return outcomeOf(await this.shopper.fillAddress());
      default:
        return unknown(call.tool);
    }
  }

  private async open(call: ToolCall): Promise<ToolOutcome> {
    const parsed = webOpenArgs.safeParse(call.args);
    if (!parsed.success) return badArgs(parsed.error);
    if (TRACKER_PATH.test(parsed.data.url)) {
      return trackerLink(parsed.data.url);
    }
    if (this.pin?.allows(parsed.data.url) === false) {
      return offPin(parsed.data.url);
    }
    return outcomeOf(await this.shopper.open(parsed.data.url));
  }

  private async search(call: ToolCall): Promise<ToolOutcome> {
    const parsed = webSearchArgs.safeParse(call.args);
    return parsed.success
      ? outcomeOf(await this.shopper.search(parsed.data.query))
      : badArgs(parsed.error);
  }

  private async addToCart(call: ToolCall): Promise<ToolOutcome> {
    const parsed = webRefArgs.safeParse(call.args);
    return parsed.success
      ? outcomeOf(await this.shopper.addToCart(parsed.data.ref))
      : badArgs(parsed.error);
  }
}

/** The failure code a refused call carries, for the pill that records it.
 *  The runner built this JSON itself one frame down, so the parse is of its
 *  own writing; anything unreadable stays a generic failure. */
function failureOf(outcome: ToolOutcome): string | null {
  if (!outcome.isError) return null;
  try {
    const body: unknown = JSON.parse(outcome.content);
    const failure =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)["failure"]
        : null;
    return typeof failure === "string" ? failure : "failed";
  } catch {
    return "failed";
  }
}

/** Refused, and told what to do instead: the errand is about one listing, and
 *  the way back to it is the shop's own search, not another product. */
/** A sponsored click-tracker is not a page: the one live run that opened
 *  /sspa/click wedged its window in a redirect chain and every read after
 *  it burned the full watchdog. Refused at the tool, so no prompt has to
 *  win this argument. */
const TRACKER_PATH = /\/(sspa\/click|gp\/slredirect|aax-|adclick|clk)/i;

function trackerLink(url: string): ToolOutcome {
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

function offPin(url: string): ToolOutcome {
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

function unreachable(tool: string): ToolOutcome {
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

function unknown(tool: string): ToolOutcome {
  return {
    content: JSON.stringify({ ok: false, failure: "unknown_tool", tool }),
    isError: true,
  };
}
