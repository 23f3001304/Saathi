import { withCoordinateGrid } from "@covenant/browser-drive";
import type { Capture, SessionState, Waiter } from "@covenant/browser-drive";

/**
 * The window as the errand is allowed to see it, and the only way anything in
 * this host takes a picture of a page.
 *
 * It is `session.screenshot()` and nothing else, which is the whole security
 * argument in one line: that is the capture the shopper's own card paints
 * from, so a field the classifier blanks is blank for the model too, and the
 * shutter that closes on a protected field closes on the model at the same
 * instant. There is no second path to raw pixels here to keep in step with it.
 */

/** What one look at the window yielded, and what to say about it. */
export interface Picture {
  /** A `data:image/png;base64,...` URL, or `null` when none may leave. */
  readonly image: string | null;
  /** `"attached"`, or `withheld: ` and why - the model is told either way. */
  readonly note: string;
  readonly width: number;
  readonly height: number;
  /** How many boxes the classifier painted out of this frame. */
  readonly redacted: number;
}

/**
 * Long enough for a click's repaint to land, short enough that a move does not
 * feel like a wait. It is a beat, not a settle: the acts that navigate already
 * wait for their own page in `settleAfterAct`, and a page that will never
 * settle must not be able to stall the move behind a picture of it.
 */
export const PICTURE_SETTLE_MS = 500;

export const ATTACHED = "attached";
export const SHUTTER_CLOSED = "withheld: a protected field has focus";
export const WINDOW_IS_THEIRS = "withheld: the window is the shopper's";
export const NO_WINDOW_OPEN = "withheld: no window is open";
export const NO_PICTURE = "withheld: the window could not be pictured";

/** Looking at the window, which is not driving it: the narrow face of
 *  `BrowserSession` this needs, so a test can hold the shutter itself. */
export interface Pictured {
  currentState(): SessionState;
  screenshot(): Promise<Capture>;
}

export function withheld(note: string): Picture {
  return { image: null, note, width: 0, height: 0, redacted: 0 };
}

/**
 * DECISION: nothing is captured unless the agent is driving.
 *
 * `FrameCapture` deliberately stops redacting once the wheel is the shopper's
 * - the person watching the stream and the person typing the secret are the
 * same person, and blacking out their own screen protects nobody. That reason
 * gets it exactly backwards for a model: a refusal can move the wheel inside
 * the very call whose picture we are about to take, and the frame that came
 * back would be the unredacted one. So the wheel is checked here, before the
 * shutter, and the model is told why it got nothing.
 */
export async function pictureOf(
  session: Pictured,
  waiter: Waiter,
): Promise<Picture> {
  if (session.currentState() !== "agent-drive") {
    return withheld(WINDOW_IS_THEIRS);
  }
  await waiter.sleep(PICTURE_SETTLE_MS);
  const capture = await taken(session);
  if (capture === null) return withheld(NO_PICTURE);
  if (capture.kind === "blackout") return withheld(SHUTTER_CLOSED);
  if (capture.frame.mediaType !== "image/png") return withheld(NO_PICTURE);
  const grid = withCoordinateGrid(capture.frame.bytes);
  return {
    image: `data:image/png;base64,${Buffer.from(grid).toString("base64")}`,
    note: ATTACHED,
    width: capture.frame.width,
    height: capture.frame.height,
    redacted: capture.frame.redacted,
  };
}

/** A window that would not be photographed is a fact about the window, never
 *  a failed move: the model still needs the move's own answer. */
async function taken(session: Pictured): Promise<Capture | null> {
  try {
    return await session.screenshot();
  } catch {
    return null;
  }
}
