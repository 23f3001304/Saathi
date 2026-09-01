import { paiseFromRupees } from "../listings/itemDraft.ts";

// Which tool a typed sentence asks for.
//
// DECISION: this is a table of patterns, not a model call. The merchant agent
// is allowed to explain a fold; it is not allowed to be the reason a tool ran,
// because the tools that matter here draft changes to a real shop's real
// catalogue. A regex that fails to understand a sentence says so and offers
// the list; a model that misunderstands one signs nothing but wastes the
// merchant's afternoon proposing the wrong thing.
//
// The server half named in `transport.ts` may put a model in front of this
// step. It still lands on the same tool names with the same arguments, and the
// proposal it produces still goes to the merchant's key or nowhere.

export type ToolCall = {
  readonly tool: string;
  readonly args: Readonly<Record<string, string>>;
};

const PRICE = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i;

const AT_PRICE = /\b(?:at|for|price|priced)\b/i;

type Matcher = { tool: string; test: RegExp };

/** First match wins, so the specific verbs sit above the general nouns. */
const MATCHERS: readonly Matcher[] = [
  {
    tool: "listing.propose_create",
    test: /\b(add|list|create|new listing|start selling)\b/i,
  },
  {
    tool: "listing.propose_edit",
    test: /\b(fix|change|edit|update|retire|withdraw|reprice)\b/i,
  },
  {
    tool: "orders.cooloff",
    test: /\bcool[- ]?off|waiting|not yet money|releases?\b/i,
  },
  {
    tool: "orders.recent",
    test: /\border|sold|sale|purchase|payment|captured|settle/i,
  },
  {
    tool: "demand.unmet",
    test: /\bdemand|asking for|don'?t stock|do not stock|unmet|missing|searched/i,
  },
  {
    tool: "listings.audit",
    test: /\blisting|copy|wording|dark pattern|scarcity|anchor|audit/i,
  },
  {
    tool: "leakage.refusals",
    test: /\brefus|leak|reason code|lost|bled|expired/i,
  },
  { tool: "shop.standing", test: /\bstanding|trust|score|rating|reputation/i },
  {
    tool: "shop.briefing",
    test: /\bwhy|picked|chosen|how am i|what'?s wrong|problem/i,
  },
];

export function priceFrom(text: string): number | null {
  const found = PRICE.exec(text);
  if (found?.[1] === undefined) return null;
  // "add a stole" must not become a listing priced at nothing; a bare number
  // only counts as a price when the sentence says it is one.
  if (!AT_PRICE.test(text) && !/₹|rs\.?|inr/i.test(text)) return null;
  return paiseFromRupees(found[1]);
}

const NAME =
  /\b(?:add|list|create)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:at|for|priced)\b.*)?$/i;

export function nameFrom(text: string): string {
  const found = NAME.exec(text.trim());
  return (found?.[1] ?? "").replace(/[.,;]+$/, "").trim();
}

const URL_IN = /\bhttps?:\/\/\S+/i;

export function urlFrom(text: string): string {
  return URL_IN.exec(text)?.[0] ?? "";
}

function createArgs(text: string): Record<string, string> {
  const paise = priceFrom(text);
  const args: Record<string, string> = { name: nameFrom(text) };
  if (paise !== null) args["amount_paise"] = paise.toString();
  const url = urlFrom(text);
  if (url !== "") args["product_url"] = url;
  return args;
}

function editArgs(text: string): Record<string, string> {
  const paise = priceFrom(text);
  const args: Record<string, string> = {};
  if (paise !== null) args["amount_paise"] = paise.toString();
  const url = urlFrom(text);
  if (url !== "") args["product_url"] = url;
  if (/\bretire|withdraw\b/i.test(text)) args["active"] = "false";
  return args;
}

const ARGS_FOR: Record<string, (text: string) => Record<string, string>> = {
  "listing.propose_create": createArgs,
  "listing.propose_edit": editArgs,
};

/** `null` when nothing matched — the assistant then says so and lists what it can do. */
export function routeIntent(text: string): ToolCall | null {
  const matched = MATCHERS.find((matcher) => matcher.test.test(text));
  if (matched === undefined) return null;
  return { tool: matched.tool, args: ARGS_FOR[matched.tool]?.(text) ?? {} };
}
