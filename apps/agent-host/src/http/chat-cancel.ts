import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { BeatHub } from "./beat-hub.js";

/**
 * A deleted chat takes its working jobs with it. What can be stopped is
 * stopped honestly: both gates refuse rather than hang, and the hub restarts
 * so no late beat lands in a chat that no longer exists. A model call already
 * in flight runs to its end in the background — there is no clean way to kill
 * it mid-token — but everything it would have touched is gone when it
 * returns. The window is closed by the route, which holds the browser; this
 * module deliberately does not.
 */
export function cancelChat(
  intentGate: ConfirmationGate,
  cartGate: ConfirmationGate,
  hub: BeatHub,
): boolean {
  intentGate.refuse();
  cartGate.refuse();
  hub.restart();
  return true;
}
