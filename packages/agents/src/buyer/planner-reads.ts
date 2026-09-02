import type { ToolDeclaration } from "../providers/tool-declarations.js";
import { SEE_SHELF_TOOL, SEE_STATE_TOOL } from "./turn-plan.js";
import { declareTool } from "./turn-plan-declare.js";

/**
 * What the planner may look at before it moves.
 *
 * DECISION: reads rather than a digest. The shell used to inject a summary of
 * what it thought the model needed and then grew word lists to police the
 * guesses the model made without it. Every field here is a host-read fact;
 * page-derived strings are data the prompt already marks as such, and no
 * field is ever a password (the vault's list carries host and username only).
 */
export interface ShelfRow {
  readonly sku: string;
  readonly label: string;
  readonly category: string;
  readonly list_price_paise: number;
  readonly currency: string;
  readonly image_url: string | null;
}

export interface ShelfSight {
  readonly merchant: string;
  readonly rows: readonly ShelfRow[];
}

export interface OnScreenOption {
  readonly ref: string;
  readonly title: string;
  readonly price_text: string;
  readonly url: string;
  readonly source: "web" | "shop";
}

export interface CheckoutState {
  readonly parked: "address" | "code" | "handback" | null;
  readonly basket_holds: string | null;
  readonly window: "agent" | "shopper" | "none";
  readonly at_payment: boolean;
}

export interface CovenantState {
  /** The standing covenant's scalar bounds, in the gateway's own predicates. */
  readonly bounds: readonly {
    readonly predicate: string;
    readonly value: number | boolean | string;
  }[];
  readonly merchants: readonly string[];
  readonly skus: readonly string[];
  readonly envelopes: readonly {
    readonly category: string;
    readonly cap_paise: number;
  }[];
  readonly blackout: {
    readonly tz: string;
    readonly from: string;
    readonly to: string;
  } | null;
  readonly pending_signature: "intent" | "cart" | null;
}

export interface AppState {
  readonly language_setting: string | null;
  readonly on_screen: {
    readonly options: readonly OnScreenOption[];
    readonly picked: {
      readonly ref: string;
      readonly title: string;
      readonly url: string;
    } | null;
  };
  readonly checkout: CheckoutState | null;
  readonly covenant: CovenantState;
  /** Never a password. */
  readonly sign_ins: readonly {
    readonly host: string;
    readonly username: string;
  }[];
  readonly earlier_dialogue_summary: string | null;
}

export interface PlannerReads {
  shelf(): Promise<ShelfSight>;
  state(): Promise<AppState>;
}

export const PLANNER_READ_TOOLS: readonly ToolDeclaration[] = [
  declareTool(
    SEE_SHELF_TOOL,
    "What this shop stocks, read by this host: every listing's id, name, " +
      "category and list price. Look here before you say what the shop " +
      "has, before you show them options from it, and before you name a " +
      "thing to buy. A look is not a move: after it, still call exactly " +
      "one move.",
    {},
  ),
  declareTool(
    SEE_STATE_TOOL,
    "Where things stand right now: the cards on their screen and which one " +
      "they picked, whether a checkout is parked and on what, who holds the " +
      "sandbox window, what their covenant currently allows and whether a " +
      "signature is pending, which shops they have a stored sign-in for " +
      "(host and username only), and the reply language they set. Look " +
      "when the answer depends on it; do not look when it does not.",
    {},
  ),
];
