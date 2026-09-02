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
  // Proposing an amendment and remembering a trait are the same kind of act:
  // the model states something, and a signature or the write gate decides
  // whether it lands. Neither can move money and neither can move a bound.
  "amend_covenant",
  "remember_trait",
  ...WEB_SHOP_TOOLS,
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
