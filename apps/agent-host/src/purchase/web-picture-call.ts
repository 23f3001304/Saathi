import type { ToolCall, ToolOutcome } from "@covenant/agents";
import {
  WEB_ADD_TO_CART_TOOL,
  WEB_ENTER_CODE_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_GLANCE_TOOL,
  WEB_OPEN_TOOL,
  WEB_PRESS_TOOL,
  WEB_READ_TOOL,
  WEB_SCROLL_TOOL,
  WEB_SIGN_IN_TOOL,
  WEB_WRITE_TOOL,
} from "@covenant/agents";

import type { GlanceVerbs } from "../browser/web-glance.js";
import type { Picture } from "../browser/web-picture.js";
import { NO_PICTURE, withheld } from "../browser/web-picture.js";
import { withinCall } from "./call-ceiling.js";
import { outcomeOf, unknown } from "./web-tool-guards.js";

/**
 * How long the shutter gets. Short, and a real watchdog for the same reason
 * `CALL_CEILING_MS` is one: the move that just returned `page_unreachable` is
 * exactly the move whose window will never answer a screenshot either, and
 * this capture runs outside the tool ceiling. A picture nobody can take must
 * cost the errand a moment, never the turn.
 */
const PICTURE_CEILING_MS = 10_000;

/**
 * The window moves, and therefore the calls whose result is followed by a
 * picture of the window they left behind.
 *
 * `web_search` types into the page but its answer is the fresh reading it
 * causes; `web_cart`, `web_verify`, `web_card` and `web_found` are reads and
 * records, not moves; and `web_handover` is the one move whose whole point is
 * that the window stops being the agent's, so a picture of it afterwards would
 * be a picture of somebody else's screen. `web_glance` is missing here because
 * it takes its own picture - it *is* the picture - and would otherwise open
 * the shutter twice.
 */
const WINDOW_MOVES: readonly string[] = [
  WEB_OPEN_TOOL,
  WEB_READ_TOOL,
  WEB_PRESS_TOOL,
  WEB_WRITE_TOOL,
  WEB_SCROLL_TOOL,
  WEB_ADD_TO_CART_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_SIGN_IN_TOOL,
  WEB_ENTER_CODE_TOOL,
];

/**
 * The picture rides beside the text outcome, in `ToolOutcome.image`, and never
 * inside it: the provider session attaches it to the model's next turn, while
 * the beat log is written from the step labels and carries no frame at all
 * (pinned by `beat-rehydrate.test.ts`). The body gains one word - whether a
 * picture came, and if not, why - so a model that is looking at nothing knows
 * it is looking at nothing rather than trusting the last one it saw.
 *
 * A refused move gets a picture too. The refusal is exactly when the model
 * most needs to see where it is standing, and the window is in whatever state
 * the refusal left it.
 */
export async function withPicture(
  call: ToolCall,
  outcome: ToolOutcome,
  verbs: GlanceVerbs | null,
): Promise<ToolOutcome> {
  if (verbs === null || !WINDOW_MOVES.includes(call.tool)) return outcome;
  const seen = await pictured(verbs, call.tool);
  return {
    ...outcome,
    content: noted(outcome.content, seen.note),
    ...(seen.image === null ? {} : { image: seen.image }),
  };
}

async function pictured(verbs: GlanceVerbs, tool: string): Promise<Picture> {
  try {
    return await withinCall(verbs.picture(), tool, PICTURE_CEILING_MS);
  } catch {
    return withheld(NO_PICTURE);
  }
}

/** The JSON was written one frame down by `web-tool-guards`, so the parse is
 *  of this host's own writing; anything unreadable is left exactly as it is. */
function noted(content: string, note: string): string {
  try {
    const body: unknown = JSON.parse(content);
    if (typeof body !== "object" || body === null) return content;
    return JSON.stringify({ ...body, picture: note });
  } catch {
    return content;
  }
}

/** Looking again without moving. `null` for any other tool; `unknown` where no
 *  window can be pictured, so the model hears "not a tool here". */
export async function glanceCall(
  call: ToolCall,
  verbs: GlanceVerbs | null,
): Promise<ToolOutcome | null> {
  if (call.tool !== WEB_GLANCE_TOOL) return null;
  if (verbs === null) return unknown(call.tool);
  const seen = await verbs.glance();
  const outcome = outcomeOf(seen.result);
  return seen.image === null ? outcome : { ...outcome, image: seen.image };
}
