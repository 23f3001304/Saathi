import type { ToolCall, ToolOutcome } from "@covenant/agents";
import {
  WEB_PRESS_TOOL,
  WEB_SEARCH_TOOL,
  WEB_WRITE_TOOL,
} from "@covenant/agents";
import type { z } from "zod";

import type { WebShopper } from "../browser/web-shopper.js";
import type { WebResult } from "../browser/web-result.js";
import { badArgs, outcomeOf } from "./web-tool-guards.js";
import { webPressArgs, webSearchArgs, webWriteArgs } from "./web-tools.js";

/**
 * The act calls that are pure argument-parsing over the shopper: a search, a
 * press, a write. `null` for any other tool, so the runner keeps the calls
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
