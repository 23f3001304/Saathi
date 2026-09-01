import type { BrowserSession, HandoffTarget } from "@covenant/browser-drive";

/**
 * Who is holding the wheel, as three operations on a live session.
 *
 * Free functions rather than methods because none of them needs anything the
 * service owns: they are the host's half of the split-control story, and
 * keeping them here makes that half readable in one screen.
 */

/**
 * The user asking for the wheel. The state machine already has the edge — a
 * handoff is a handoff whether a refusal or a person asked for it — and having
 * it as a route is what makes "you can always take over" true rather than
 * conditional on the agent hitting something it must not touch.
 */
export function takeWheel(session: BrowserSession): void {
  if (session.currentState() === "agent-drive") {
    session.handoff().raise("final-review", session.url());
  }
}

/** User-initiated only. Nothing on this host resumes on the user's behalf. */
export function returnWheel(session: BrowserSession): void {
  session.handoff().resume();
}

/**
 * Where the user goes when this window is the wrong place to be. On the native
 * surface a real window comes to the front; in a container there is none, so
 * the answer is the URL and a sentence about why — a passkey or a security key
 * is bound to their own device, and no relay can carry one.
 */
export async function handWheelToUser(
  session: BrowserSession | null,
): Promise<HandoffTarget | null> {
  return session === null ? null : await session.handToUser();
}
