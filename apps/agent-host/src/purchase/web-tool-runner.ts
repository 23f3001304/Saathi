import type { RunnerReach } from "./runner-reach.js";
export type { RunnerReach } from "./runner-reach.js";
import type { ToolCall, ToolOutcome } from "@covenant/agents";

import {
  badArgs,
  failureOf,
  outcomeOf,
  unknown,
  unreachable,
} from "./web-tool-guards.js";
import {
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_HANDOVER_TOOL,
  WEB_OPEN_TOOL,
  WEB_READ_TOOL,
  WEB_SHOP_TOOLS,
} from "@covenant/agents";

import type { CardVerbs } from "../browser/web-card.js";
import type { HandoverMove } from "../browser/web-handover-move.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebShopper } from "../browser/web-shopper.js";
import type { SignInVerbs } from "../browser/web-sign-in.js";
import { cartCall, openCall } from "./web-open-calls.js";
import type { GlanceVerbs } from "../browser/web-glance.js";
import type { VerifyVerbs } from "../browser/web-verify.js";
import { CALL_CEILING_MS, withinCall } from "./call-ceiling.js";
import type { WebPin } from "./web-pin.js";
import type { StepSink } from "./web-steps.js";
import { stepLabel } from "./web-steps.js";
import {
  actCall,
  cardCall,
  foundCall,
  vaultCall,
  verifyCall,
} from "./web-act-calls.js";
import {
  deviceCall,
  askCall,
  seeCall,
  stateCall,
} from "./web-look-calls.js";
import { glanceCall, withPicture } from "./web-picture-call.js";
import { webHandoverArgs } from "./web-tools.js";

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
    /** Giving the window back, by name. Stated rather than defaulted, so that
     *  every host that wires a runner has to say whether it has a window to
     *  hand over; `null` is the honest answer where there is none, and the
     *  model hears "not a tool here" rather than a silent success that handed
     *  nobody anything. */
    private readonly handoverMove: HandoverMove | null,
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
    /** What else this errand may see and do; see `RunnerReach`. */
    private readonly reach: RunnerReach = {},
  ) {}

  private get research(): { verify: VerifyVerbs | null; card: CardVerbs | null } {
    return this.reach.research ?? { verify: null, card: null };
  }
  private get glanceVerbs(): GlanceVerbs | null {
    return this.reach.glance ?? null;
  }
  private get state(): NonNullable<RunnerReach["state"]> | null {
    return this.reach.state ?? null;
  }
  private get askVerb(): NonNullable<RunnerReach["ask"]> | null {
    return this.reach.ask ?? null;
  }
  private get seeParts(): NonNullable<RunnerReach["see"]> | null {
    return this.reach.see ?? null;
  }

  async run(call: ToolCall): Promise<ToolOutcome> {
    const moved = await this.bounded(call);
    // Outside the call ceiling on purpose: a picture is never worth losing a
    // move's own answer to, and `withPicture` cannot fail - a window that
    // would not be photographed comes back as a note saying so.
    const outcome = await withPicture(call, moved, this.glanceVerbs);
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
    return (
      (await this.statefulCall(call)) ??
      (await this.reachCall(call)) ??
      unknown(call.tool)
    );
  }

  /** The stateless lookups, tried in order; `null` means "not mine". */
  private async reachCall(call: ToolCall): Promise<ToolOutcome | null> {
    return (
      (await this.lookCall(call)) ??
      verifyCall(call, this.research.verify) ??
      cardCall(call, this.research.card) ??
      foundCall(call, this.findings) ??
      (await actCall(call, this.shopper)) ??
      (await vaultCall(call, this.vaultVerbs))
    );
  }

  /** The four that only look, or only ask: no page changes behind any. */
  private async lookCall(call: ToolCall): Promise<ToolOutcome | null> {
    return (
      (await stateCall(call, this.state)) ??
      (await askCall(call, this.askVerb)) ??
      (await seeCall(call, this.seeParts)) ??
      (await glanceCall(call, this.glanceVerbs)) ??
      (await deviceCall(call, this.reach.devices ?? null))
    );
  }

  private async statefulCall(call: ToolCall): Promise<ToolOutcome | null> {
    switch (call.tool) {
      case WEB_OPEN_TOOL:
        return await openCall(call, this.shopper, this.pin);
      case WEB_READ_TOOL:
        return outcomeOf(await this.shopper.read());
      case WEB_ADD_TO_CART_TOOL:
        return await cartCall(call, this.shopper);
      case WEB_CART_TOOL:
        return outcomeOf(await this.shopper.cart());
      case WEB_FILL_ADDRESS_TOOL:
        return outcomeOf(await this.shopper.fillAddress());
      case WEB_HANDOVER_TOOL:
        return await this.handover(call);
      default:
        return null;
    }
  }

  /** The one move that ends the agent's turn on purpose. It reaches no rail
   *  and presses nothing: all it does is move the wheel to the shopper. */
  private async handover(call: ToolCall): Promise<ToolOutcome> {
    if (this.handoverMove === null) return unknown(WEB_HANDOVER_TOOL);
    const parsed = webHandoverArgs.safeParse(call.args);
    if (!parsed.success) return badArgs(parsed.error);
    const { reason, why } = parsed.data;
    return outcomeOf(await this.handoverMove.raise(reason, why));
  }

}
