import type { ToolCall, ToolOutcome } from "@covenant/agents";

import {
  badArgs,
  CART_INSTEAD,
  offPin,
  outcomeOf,
  TRACKER_PATH,
  trackerLink,
  unknown,
  unreachable,
} from "./web-tool-guards.js";
import {
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_GLANCE_TOOL,
  WEB_OPEN_TOOL,
  WEB_READ_TOOL,
  WEB_SHOP_TOOLS,
} from "@covenant/agents";

import type { WebFindings } from "../browser/web-listing.js";
import type { WebShopper } from "../browser/web-shopper.js";
import type { SignInVerbs } from "../browser/web-sign-in.js";
import type { GlanceVerbs } from "../browser/web-glance.js";
import type { VerifyVerbs } from "../browser/web-verify.js";
import { CALL_CEILING_MS, withinCall } from "./call-ceiling.js";
import type { WebPin } from "./web-pin.js";
import type { StepSink } from "./web-steps.js";
import { stepLabel } from "./web-steps.js";
import { actCall, foundCall, vaultCall, verifyCall } from "./web-act-calls.js";
import { webOpenArgs, webRefArgs } from "./web-tools.js";

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
    /** Where reported research candidates become cards. The refs are minted
     *  by the host here, exactly as they are for tiles read off a page, so
     *  a pick still resolves only to a row this host recorded. */
    private readonly findings: WebFindings | null = null,
    /** The vault's tool face; `null` on a host with no vault wired. */
    private readonly vaultVerbs: SignInVerbs | null = null,
    /** The batched research reader; `null` where none is wired. */
    private readonly verifyVerbs: VerifyVerbs | null = null,
    /** The errand's eyes; `null` where no window can be pictured. */
    private readonly glanceVerbs: GlanceVerbs | null = null,
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

  /** The calls that need this runner's own state first; everything else is
   *  a stateless lookup in `web-act-calls`, tried in one chain. */
  private async dispatch(call: ToolCall): Promise<ToolOutcome> {
    const stateful = await this.statefulCall(call);
    return (
      stateful ??
      verifyCall(call, this.verifyVerbs) ??
      foundCall(call, this.findings) ??
      (await actCall(call, this.shopper)) ??
      (await vaultCall(call, this.vaultVerbs)) ??
      unknown(call.tool)
    );
  }

  private async statefulCall(call: ToolCall): Promise<ToolOutcome | null> {
    switch (call.tool) {
      case WEB_OPEN_TOOL:
        return await this.open(call);
      case WEB_READ_TOOL:
        return outcomeOf(await this.shopper.read());
      case WEB_ADD_TO_CART_TOOL:
        return await this.addToCart(call);
      case WEB_CART_TOOL:
        return outcomeOf(await this.shopper.cart());
      case WEB_FILL_ADDRESS_TOOL:
        return outcomeOf(await this.shopper.fillAddress());
      case WEB_GLANCE_TOOL:
        return await this.glance();
      default:
        return null;
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

  /** The picture rides beside the text outcome; see `ToolOutcome.image`. */
  private async glance(): Promise<ToolOutcome> {
    if (this.glanceVerbs === null) return unknown(WEB_GLANCE_TOOL);
    const seen = await this.glanceVerbs.glance();
    const outcome = outcomeOf(seen.result);
    return seen.image === null ? outcome : { ...outcome, image: seen.image };
  }

  private async addToCart(call: ToolCall): Promise<ToolOutcome> {
    const parsed = webRefArgs.safeParse(call.args);
    if (!parsed.success) return badArgs(parsed.error);
    const result = await this.shopper.addToCart(parsed.data.ref);
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