import type { BrowserSession, HandoffTarget } from "@covenant/browser-drive";

import { sessionView } from "./browser-view.js";
import type { BrowserSessionView } from "./browser-view.js";
import { handWheelToUser, returnWheel, takeWheel } from "./wheel.js";

/**
 * Who is driving, as three moves over a session that may not exist.
 *
 * They sit apart from `BrowserService` because none of them needs anything it
 * holds beyond the session itself — and the service is the file where the
 * window's *lifetime* lives, which is a different subject from whose hands are
 * on it. `null` and `false` are ordinary answers here: a wheel nobody can take
 * is not an error, it is a window that has already closed.
 */
export function handOver(
  session: BrowserSession | null,
): Promise<HandoffTarget | null> {
  return handWheelToUser(session);
}

export function takeOver(
  session: BrowserSession | null,
  id: string,
): BrowserSessionView | null {
  if (session === null) return null;
  takeWheel(session);
  return sessionView(session, id);
}

export function handBack(session: BrowserSession | null): boolean {
  if (session === null) return false;
  returnWheel(session);
  return true;
}
