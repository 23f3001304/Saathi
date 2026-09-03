import type {
  BrowserSession,
  Capture,
  LiveCast,
} from "@covenant/browser-drive";

import { sessionView } from "./browser-view.js";
import type { BrowserSessionView } from "./browser-view.js";
import { fieldViews } from "./field-view.js";
import type { FieldView } from "./field-view.js";

/**
 * Looking at the window, with no window as an ordinary answer.
 *
 * All three take the session rather than reaching for one, because none of
 * them is gated: watching is not driving, so there is no state to consult and
 * nothing here to get wrong. `null` means no sandbox is open, which the card
 * renders as a card rather than as an error.
 */
export function look(
  session: BrowserSession | null,
  id: string,
): BrowserSessionView | null {
  return session === null ? null : sessionView(session, id);
}

/**
 * A window whose renderer has died is a window with no picture, not a 500.
 *
 * `Protocol error (Runtime.callFunctionOn): Target crashed` reached the route
 * as an unhandled throw and the card's poll got a 500 — during a run, from a
 * route whose entire job is to answer "what does it look like right now?".
 * Nothing here is gated and nothing here decides anything, so there is no
 * failure to report: the honest answer to a crashed target is the same as the
 * answer to a closed one.
 */
export async function lookFrame(
  session: BrowserSession | null,
): Promise<Capture | null> {
  if (session === null) return null;
  return await session.screenshot().catch(() => null);
}

/**
 * How many documents this window has committed, and `0` where there is no
 * window: a feed with nothing to compare against must serve what it captured,
 * not discard it.
 */
export function lookNavigations(session: BrowserSession | null): number {
  if (session === null) return 0;
  try {
    return session.navigations();
  } catch {
    return 0;
  }
}

/**
 * The push half of watching, or `null` where the surface has none and the
 * polled shutter is the only way to see the window. Ungated like the rest.
 */
export function lookCast(session: BrowserSession | null): LiveCast | null {
  if (session === null) return null;
  try {
    return session.screencast();
  } catch {
    return null;
  }
}

/** Where the controls are, and which of them are the user's alone. */
export async function lookFields(
  session: BrowserSession | null,
): Promise<readonly FieldView[]> {
  if (session === null) return [];
  const found = await session.fields().catch(() => []);
  return fieldViews(found);
}
