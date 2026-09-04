import type { ToolDeclaration } from "@covenant/agents";
import {
  WEB_CARD_TOOL,
  WEB_TOOL_SERVER,
  WEB_VERIFY_TOOL,
} from "@covenant/agents";
import { z } from "zod";

import { SHARED_TOOL_DECLARATIONS } from "./web-shared-tools.js";

import { schemaOf, UNTRUSTED } from "./web-buy-tools.js";

/** One product named off a verified page; `webCardRow` is what parses it. */
const cardRow = z.object({
  url: z.url(),
  title: z.string().min(1).max(500),
  price_text: z.string().min(1).max(300),
  image_url: z.url().nullable().default(null),
});

/**
 * The research errand's whole surface: the provider's own hosted web search
 * (declared in the factory, not here) for discovery, one batched read, and
 * one call that names what was read. Research does not drive the sandbox
 * window; that opens when the shopper taps a card, to sign in and buy - which
 * is why nothing here returns a picture and everything in `web-buy-tools`
 * that touches the window does.
 */
export const RESEARCH_TOOL_DECLARATIONS: readonly ToolDeclaration[] = [
  ...SHARED_TOOL_DECLARATIONS,
  {
    tool: WEB_VERIFY_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "Read up to six product page URLs at once, in parallel, headless and " +
      "read-only. You get what each page printed: its title, its heading, " +
      "any product it declares, the money strings on it with the words " +
      "around them, and an excerpt. It records nothing and cards nothing - " +
      "read the pages, then call web_card to name the real products. Pass " +
      `direct product URLs on the shop itself, never a redirect. ${UNTRUSTED}`,
    parameters: schemaOf({ urls: z.array(z.url()).min(1).max(6) }),
  },
  {
    tool: WEB_CARD_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "Name the real products you just read, one row each: the page's URL, " +
      "the product's title and its price, both copied exactly as that page " +
      "prints them. A row is carded only where both strings are on that " +
      "page and the price is above zero; a refused row says why. Leave out " +
      "what is not for sale - a sign-in bar, a basket widget, a category " +
      `page, a cart total. Only rows with a ref are cards. ${UNTRUSTED}`,
    parameters: schemaOf({ rows: z.array(cardRow).min(1).max(6) }),
  },
];
