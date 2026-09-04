import type { ToolCall, ToolOutcome } from "@covenant/agents";
import {
  APP_STATE_TOOL,
  KEYBOARD_TOOL,
  MOUSE_TOOL,
  ASK_SHOPPER_TOOL,
  SEE_CARDS_TOOL,
  SEE_PROFILE_TOOL,
} from "@covenant/agents";

import type { SeeParts } from "../browser/app-see.js";
import { seeCards, seeProfile } from "../browser/app-see.js";
import type { StateParts } from "../browser/app-state.js";
import { appState } from "../browser/app-state.js";
import type { Devices } from "../browser/devices.js";
import type { AskVerb } from "./ask-verb.js";
import { badArgs, outcomeOf, unknown } from "./web-tool-guards.js";
import {
  askedAxes,
  askShopperArgs,
  keyboardArgs,
  mouseArgs,
} from "./web-tools.js";

/** The calls that only look at this platform, or ask its shopper something.
 *  None of them touches a page. */

/** Asking, as the model's own move. The harness parks the run; the words,
 *  the chips and the decision to ask at all are the model's. */
export function askCall(
  call: ToolCall,
  verb: AskVerb | null,
): Promise<ToolOutcome> | null {
  if (call.tool !== ASK_SHOPPER_TOOL) return null;
  if (verb === null) return Promise.resolve(unknown(call.tool));
  const parsed = askShopperArgs.safeParse(call.args);
  if (!parsed.success) return Promise.resolve(badArgs(parsed.error));
  // Budget arrives as its own typed field and joins the axes here, so the
  // verb, the beat and the composer all keep the one shape they had.
  verb.ask({
    question: parsed.data.question,
    replies: parsed.data.replies,
    groups: askedAxes(parsed.data),
  });
  return Promise.resolve({
    content: JSON.stringify({
      ok: true,
      asked: true,
      next: "Stop here. Say nothing more; their answer starts the next turn.",
    }),
    isError: false,
  });
}

/** Looking at the platform: the cards on screen, and what it knows about
 *  the shopper. Neither writes anything. */
export function seeCall(
  call: ToolCall,
  parts: SeeParts | null,
): Promise<ToolOutcome> | null {
  if (call.tool !== SEE_CARDS_TOOL && call.tool !== SEE_PROFILE_TOOL) {
    return null;
  }
  if (parts === null) return Promise.resolve(unknown(call.tool));
  const seen =
    call.tool === SEE_CARDS_TOOL
      ? Promise.resolve(seeCards(parts))
      : seeProfile(parts);
  return seen.then((body) => ({
    content: JSON.stringify(body),
    isError: false,
  }));
}

/** Where things actually stand, as the model's own read. */
export function stateCall(
  call: ToolCall,
  parts: StateParts | null,
): Promise<ToolOutcome> | null {
  if (call.tool !== APP_STATE_TOOL) return null;
  if (parts === null) return Promise.resolve(unknown(call.tool));
  return appState(parts).then((state) => ({
    content: JSON.stringify(state),
    isError: false,
  }));
}

/** The mouse and the keyboard, each answering with a fresh picture. */
export function deviceCall(
  call: ToolCall,
  devices: Devices | null,
): Promise<ToolOutcome> | null {
  if (call.tool !== MOUSE_TOOL && call.tool !== KEYBOARD_TOOL) return null;
  if (devices === null) return Promise.resolve(unknown(call.tool));
  const parsed =
    call.tool === MOUSE_TOOL
      ? mouseArgs.safeParse(call.args)
      : keyboardArgs.safeParse(call.args);
  if (!parsed.success) return Promise.resolve(badArgs(parsed.error));
  const moved =
    call.tool === MOUSE_TOOL
      ? devices.mouse(parsed.data as never)
      : devices.keyboard(parsed.data as never);
  return moved.then((seen) => {
    const outcome = outcomeOf(seen.result);
    return seen.image === null ? outcome : { ...outcome, image: seen.image };
  });
}
