import type { ToolCall } from "../shared/tool-envelope.js";

/**
 * The one server the `GatewayClient` answers on. F2: money leaves the agent
 * through this name or it does not leave at all.
 */
export const GATEWAY_TOOL_SERVER = "covenant_gateway";

export const MERCHANT_TOOL_SERVER = "covenant_merchant";

/** The sandboxed Chrome window. It reaches no rail and holds no key. */
export const WEB_TOOL_SERVER = "covenant_web";

/**
 * Shopping the open web through the sandbox. None of these moves money: the
 * only click any of them can make is judged by `FieldClassifier` at the DOM
 * boundary first, and a page's own "Place order" button is refused there. That
 * refusal is a different mechanism from this registry on purpose — F2 is about
 * which *tool* may reach a rail, and no rail is reachable from a browser
 * window at all.
 */
export const WEB_OPEN_TOOL = "web_open";
export const WEB_READ_TOOL = "web_read";
export const WEB_SEARCH_TOOL = "web_search";
export const WEB_ADD_TO_CART_TOOL = "web_add_to_cart";
export const WEB_CART_TOOL = "web_cart";
/**
 * Filling a delivery form. It takes no text: the host matches the page's boxes
 * to what the shopper has stated about themselves and types those values, so
 * there is no argument here through which a model could put words on a form.
 */
export const WEB_FILL_ADDRESS_TOOL = "web_fill_address";
export const WEB_PRESS_TOOL = "web_press";
export const WEB_WRITE_TOOL = "web_write";
export const WEB_FOUND_TOOL = "web_found";
export const WEB_SIGN_IN_TOOL = "web_sign_in";
export const WEB_ENTER_CODE_TOOL = "web_enter_code";
export const WEB_VERIFY_TOOL = "web_verify";
/**
 * Naming the products on the pages `web_verify` just read, so the host can
 * card them.
 *
 * F2: it moves no money and reaches no rail. All it asks for is a ref against
 * a title and a price, and the host mints one only where both strings are
 * verbatim on a page it opened itself and the price parses above zero — the
 * model can name what it read, never what it would like to be true.
 */
export const WEB_CARD_TOOL = "web_card";
export const WEB_GLANCE_TOOL = "web_glance";
export const APP_STATE_TOOL = "app_state";
export const ASK_SHOPPER_TOOL = "ask_shopper";
export const SEE_CARDS_TOOL = "see_cards";
export const SEE_PROFILE_TOOL = "see_profile";
export const MOUSE_TOOL = "mouse";
export const KEYBOARD_TOOL = "keyboard";
/**
 * Looking further down the page the window is already on.
 *
 * F2: it moves no money and reaches no rail. It carries no target at all, only
 * a distance in viewport pixels, so there is nothing under it to press and
 * nothing in it to type: the most a shopper's own scroll wheel could do.
 */
export const WEB_SCROLL_TOOL = "web_scroll";
/**
 * Giving the window back to the shopper, because the model read the page and
 * decided the next step is not the agent's to take.
 *
 * F2: it moves no money, and it is the one tool here that could not even in
 * principle — all it does is move the session state machine to `user-drive`,
 * which takes the agent's hands *off* the page. The window it hands over
 * reaches no rail and holds no key, exactly as before.
 */
export const WEB_HANDOVER_TOOL = "web_handover";

export const WEB_SHOP_TOOLS: readonly string[] = [
  WEB_OPEN_TOOL,
  WEB_READ_TOOL,
  WEB_SEARCH_TOOL,
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_PRESS_TOOL,
  WEB_WRITE_TOOL,
  WEB_FOUND_TOOL,
  WEB_SIGN_IN_TOOL,
  WEB_ENTER_CODE_TOOL,
  WEB_VERIFY_TOOL,
  WEB_CARD_TOOL,
  WEB_GLANCE_TOOL,
  WEB_SCROLL_TOOL,
  WEB_HANDOVER_TOOL,
];

/** The money surface of §4.1, as tool names. */
export const GATEWAY_MONEY_TOOLS: readonly string[] = [
  "verify_cart",
  "execute_payment",
  "covenant_sign",
  "cooloff_cancel",
  "cooloff_restore",
];

/**
 * The explicit not-money list. Everything absent from it is money-affecting,
 * including a tool nobody has heard of — a registry that defaulted to "safe"
 * would make F2 a function of how complete the list is on demo day.
 */
export const NON_MONEY_TOOLS: readonly string[] = [
  "catalog_search",
  "quote_request",
  "price_history",
  "memory_write",
  "memory_retrieve",
  "present_options",
  // The buyer's own turn-plan tools. They say what the agent decided this turn
  // was; nothing follows from one but prose and, at most, the right to *start*
  // a draft the schema and the human still have to accept.
  "answer_shopper",
  "browse_catalog",
  // Looking on the open web is a turn-plan move like the rest of them: it
  // records that the agent decided to go and look. What it then reaches is the
  // `covenant_web` tools below, each judged here on its own.
  "look_on_web",
  "propose_purchase",
  "decline_purchase",
  // Naming a card already on the screen. What follows is the same path a tap
  // takes, and every step of it is judged on its own.
  "pick_option",
  // Proposing an amendment and remembering a trait are the same kind of act:
  // the model states something, and a signature or the write gate decides
  // whether it lands. Neither can move money and neither can move a bound.
  "amend_covenant",
  "remember_trait",
  // The planner's reads. A read records nothing and reaches nothing: it
  // returns host-held facts to the model and cannot move a bound or a rupee.
  "see_shelf",
  "see_state",
  ...WEB_SHOP_TOOLS,
  // The errand's own reads and its question. Each was declared to the model
  // without being named here, so the registry's fail-closed default called
  // them money tools and the hook refused all six with a sentence about moving
  // money - which is why the coordinate devices had never once worked live.
  //
  // None of them can reach a rail. `app_state`, `see_cards` and `see_profile`
  // return host-held facts and record nothing. `ask_shopper` produces a
  // question and stops the turn. `mouse` and `keyboard` carry a viewport point
  // and a distance, nothing else: every point is judged by `FieldClassifier`
  // at hit-test before anything happens, which is the same boundary that
  // refuses a page's own "Place order" for the selector-aimed tools above.
  APP_STATE_TOOL,
  SEE_CARDS_TOOL,
  SEE_PROFILE_TOOL,
  ASK_SHOPPER_TOOL,
  MOUSE_TOOL,
  KEYBOARD_TOOL,
];

export interface MoneyToolRegistryConfig {
  readonly gatewayServer: string;
  readonly gatewayMoneyTools: readonly string[];
  readonly nonMoneyTools: readonly string[];
}

export const DEFAULT_MONEY_TOOL_CONFIG: MoneyToolRegistryConfig = {
  gatewayServer: GATEWAY_TOOL_SERVER,
  gatewayMoneyTools: GATEWAY_MONEY_TOOLS,
  nonMoneyTools: NON_MONEY_TOOLS,
};

export class MoneyToolRegistry {
  constructor(
    private readonly config: MoneyToolRegistryConfig = DEFAULT_MONEY_TOOL_CONFIG,
  ) {}

  /** Unknown ⇒ money-affecting. Fail closed, always. */
  isMoneyAffecting(tool: string): boolean {
    return !this.config.nonMoneyTools.includes(tool);
  }

  /**
   * A money tool must be one the gateway client actually declares *and* arrive
   * on the gateway server. Either half alone is forgeable: a merchant server
   * can name a tool `execute_payment`, and the gateway server can be asked for
   * a tool it never published.
   */
  targetsGatewayClient(call: ToolCall): boolean {
    return (
      call.server === this.config.gatewayServer &&
      this.config.gatewayMoneyTools.includes(call.tool)
    );
  }
}
