// A window the run opened, rebuilt from the durable log: the whole card except
// the picture. Kept out of the chat tree because the decision it makes is not a
// rendering one — it is which of two different facts about the window is true.
import type { SandboxSession } from "../api/agentBeat.ts";
import type { BrowserSessionView } from "./browserSession.ts";

export const CLOSED_NOTICE =
  "That window is closed. This is what the agent did in it.";

/**
 * Two facts, and the card used to tell only one of them. `browser.view` being
 * null means this page has no live reading — which is what happens when the
 * sandbox transport cannot attach, and *not* the same as the run having closed
 * the window. Asserting the second when only the first is known is the same
 * lie the fixture reel used to tell in the other direction, and it was on
 * screen while the host was answering `/browser/state` with `agent-drive` on a
 * real amazon.in URL.
 */
export const UNREACHABLE_NOTICE =
  "The agent left this window open, but this page cannot reach it right now. What is below is the record of what the agent did in it, not a reading of what is on it now.";

/**
 * Nothing here is drivable, whichever fact it is telling: a restored card that
 * offered you a surface would be aiming your clicks at a window this page has
 * no hold on. `unreachable` is a card-only state for exactly that reason — it
 * keeps the driving branches shut without claiming the window is closed.
 */
export function restoredCard(
  session: SandboxSession | null,
): BrowserSessionView | null {
  if (session === null) return null;
  const closed = session.state === "closed";
  return {
    id: session.id,
    sandbox: session.sandbox,
    merchant: session.merchant,
    url: session.url,
    title: session.title,
    state: closed ? "closed" : "unreachable",
    ...(session.handoff === null ? {} : { handoff: session.handoff }),
    actions: session.actions,
    notice: closed ? CLOSED_NOTICE : UNREACHABLE_NOTICE,
  };
}
