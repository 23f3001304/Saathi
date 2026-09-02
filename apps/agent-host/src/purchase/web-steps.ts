import {
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_OPEN_TOOL,
  WEB_PRESS_TOOL,
  WEB_READ_TOOL,
  WEB_SEARCH_TOOL,
  WEB_WRITE_TOOL,
} from "@covenant/agents";

import { pageName } from "../browser/browser-view.js";

/**
 * What the agent is doing, while nobody can watch it do it.
 *
 * DECISION: research happens without a window on screen, and a phase with
 * nothing to show is not a phase with nothing to say. Sixty seconds of an
 * unexplained pause is the stall this product has already been accused of
 * once; these are what the shopper reads instead, and they are the harness's
 * record of what actually happened rather than the agent's account of it —
 * emitted from the tool runner, after the call, from the call's own outcome.
 *
 * DECISION: harness-authored labels, not model prose. The one model-written
 * string that reaches a pill is the search query, which is the agent's own
 * words about its own move — never text read off a page. Everything a page
 * said stays where untrusted text belongs.
 */
export interface StepSink {
  step(label: string): void;
}

const QUERY_CHARS = 60;

/** A product URL's path is forty characters of slug and an ASIN: it names the
 *  page to a machine and nothing at all to a person. The pill says where the
 *  window went, which is the shop. */
const NAME_CHARS = 32;

function hostOf(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) return "the page";
  const named = pageName(url);
  return named.length > NAME_CHARS ? `${named.slice(0, NAME_CHARS)}…` : named;
}

function queryOf(query: unknown): string {
  const text = typeof query === "string" ? query.trim() : "";
  return text.length > QUERY_CHARS ? `${text.slice(0, QUERY_CHARS)}…` : text;
}

const LABELS: Readonly<
  Record<string, (args: Record<string, unknown>) => string>
> = {
  [WEB_OPEN_TOOL]: (args) => `Opened ${hostOf(args["url"])}`,
  [WEB_READ_TOOL]: () => "Read the page",
  [WEB_SEARCH_TOOL]: (args) => {
    const query = queryOf(args["query"]);
    return query === "" ? "Searched the shop" : `Searched for “${query}”`;
  },
  [WEB_ADD_TO_CART_TOOL]: () => "Put it in the shop's basket",
  [WEB_PRESS_TOOL]: () => "Pressed a control on the page",
  [WEB_WRITE_TOOL]: () => "Typed into a box on the page",
  [WEB_CART_TOOL]: () => "Read the basket total",
  [WEB_FILL_ADDRESS_TOOL]: () => "Filled the delivery form",
};

/**
 * Why a step did not land, in words a shopper can act on. "did not go
 * through" twice in a row read as an unexplained malfunction; the failure
 * code the tool result already carries names the cause, so the pill does too.
 * Codes come from `web-result.ts`, `web-tool-runner.ts`, `web-challenge.ts`
 * and the classifier's refusals; anything unnamed keeps the generic line.
 */
const CAUSES: Readonly<Record<string, string>> = {
  bot_check: "the shop wants a human check",
  page_unreachable: "the page stopped answering",
  page_moved: "the page moved mid-read",
  no_window_open: "no window was open yet",
  user_is_driving: "paused, the window is yours",
  not_this_product: "a different product, skipped",
  at_login_step: "stopped, sign-in is yours",
  at_payment_step: "stopped, the payment step is yours",
  payment_button: "refused, that control pays",
  sensitive_field: "refused, that field is protected",
  restricted_context: "refused, that page is read-only",
  element_missing: "nothing on the page matched",
  navigation_blocked: "that address is off-limits",
  covenant_violation: "outside what you signed",
};

/** `null` for a tool with nothing worth showing, so the list stays what the
 *  agent did rather than everything it called. */
export function stepLabel(
  tool: string,
  args: Record<string, unknown>,
  failure: string | null,
): string | null {
  const label = LABELS[tool]?.(args) ?? null;
  if (label === null) return null;
  if (failure === null) return label;
  // A refusal is a step too, and the one most worth seeing: it is the block
  // matrix working, and hiding it would leave a gap in the record.
  return `${label} · ${CAUSES[failure] ?? "did not go through"}`;
}
