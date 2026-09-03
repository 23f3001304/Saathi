import type { ToolCall, ToolOutcome } from "@covenant/agents";
import {
  WEB_CARD_TOOL,
  WEB_ENTER_CODE_TOOL,
  WEB_FOUND_TOOL,
  WEB_VERIFY_TOOL,
  WEB_PRESS_TOOL,
  WEB_SCROLL_TOOL,
  WEB_SEARCH_TOOL,
  WEB_SIGN_IN_TOOL,
  WEB_WRITE_TOOL,
} from "@covenant/agents";
import type { z } from "zod";

import type { WebShopper } from "../browser/web-shopper.js";
import type { SignInVerbs } from "../browser/web-sign-in.js";
import type { VerifyVerbs } from "../browser/web-verify.js";
import type { CardVerbs } from "../browser/web-card.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebResult } from "../browser/web-result.js";
import { badArgs, outcomeOf, unknown } from "./web-tool-guards.js";
import {
  webCardArgs,
  webEnterCodeArgs,
  webFoundArgs,
  webVerifyArgs,
  webPressArgs,
  webScrollArgs,
  webSearchArgs,
  webWriteArgs,
} from "./web-tools.js";

/**
 * The act calls that are pure argument-parsing over the shopper: a search, a
 * press, a write, a scroll. `null` for any other tool, so the runner keeps the
 * calls
 * that need its own state (the pin, the basket guidance) and asks here last.
 */
export function actCall(
  call: ToolCall,
  shopper: WebShopper,
): Promise<ToolOutcome> | null {
  switch (call.tool) {
    case WEB_SEARCH_TOOL:
      return parsedCall(webSearchArgs, call, (args) =>
        shopper.search(args.query),
      );
    case WEB_PRESS_TOOL:
      return parsedCall(webPressArgs, call, (args) =>
        shopper.press(args.x, args.y),
      );
    case WEB_WRITE_TOOL:
      return parsedCall(webWriteArgs, call, (args) =>
        shopper.write(args.x, args.y, args.text),
      );
    case WEB_SCROLL_TOOL:
      return parsedCall(webScrollArgs, call, (args) => shopper.scroll(args.dy));
    default:
      return null;
  }
}

async function parsedCall<S extends z.ZodType>(
  schema: S,
  call: ToolCall,
  run: (args: z.infer<S>) => Promise<WebResult>,
): Promise<ToolOutcome> {
  const parsed = schema.safeParse(call.args);
  return parsed.success
    ? outcomeOf(await run(parsed.data))
    : badArgs(parsed.error);
}

/** The vault's two calls. `null` for any other tool; `unknown` when a host
 *  has no vault wired, so the model hears "not a tool here" rather than a
 *  silent success that signed nobody in. */
export function vaultCall(
  call: ToolCall,
  verbs: SignInVerbs | null,
): Promise<ToolOutcome> | null {
  switch (call.tool) {
    case WEB_SIGN_IN_TOOL:
      return verbs === null
        ? Promise.resolve(unknown(call.tool))
        : verbs.signIn().then(outcomeOf);
    case WEB_ENTER_CODE_TOOL:
      return verbs === null
        ? Promise.resolve(unknown(call.tool))
        : parsedCall(webEnterCodeArgs, call, (args) =>
            verbs.enterCode(args.code),
          );
    default:
      return null;
  }
}

/** Research candidates in, cards out. Untrusted rows: the host re-parses
 *  every price and drops any URL that is not plain http(s); refs are minted
 *  by the findings table, exactly as for tiles read off a page. */
export function foundCall(
  call: ToolCall,
  findings: WebFindings | null,
): ToolOutcome | null {
  if (call.tool !== WEB_FOUND_TOOL) return null;
  const parsed = webFoundArgs.safeParse(call.args);
  if (!parsed.success) return badArgs(parsed.error);
  if (findings === null) return unknown(call.tool);
  const rows = findings.record(
    parsed.data.found.map((row) => ({
      title: row.title.slice(0, 200).trim(),
      // The head of the claim is the price; annotations follow it.
      priceText: row.price_text.slice(0, 60).trim(),
      href: row.url,
      imageUrl: row.image_url,
    })),
  );
  return {
    content: JSON.stringify({
      ok: true,
      recorded: rows.length,
      refs: rows.map((row) => row.ref),
    }),
    isError: false,
  };
}

/** The batched research read. `null` for any other tool. */
export function verifyCall(
  call: ToolCall,
  verbs: VerifyVerbs | null,
): Promise<ToolOutcome> | null {
  if (call.tool !== WEB_VERIFY_TOOL) return null;
  if (verbs === null) return Promise.resolve(unknown(call.tool));
  return parsedCall(webVerifyArgs, call, (args) => verbs.verify(args.urls));
}

/** The model naming the listings on pages it has just been handed. Untrusted
 *  rows, like `web_found`'s: the difference is that every string here is
 *  checked against the read this host took, rather than trusted because the
 *  model wrote it down. */
export function cardCall(
  call: ToolCall,
  verbs: CardVerbs | null,
): ToolOutcome | null {
  if (call.tool !== WEB_CARD_TOOL) return null;
  if (verbs === null) return unknown(call.tool);
  const parsed = webCardArgs.safeParse(call.args);
  return parsed.success
    ? outcomeOf(verbs.card(parsed.data.rows))
    : badArgs(parsed.error);
}
