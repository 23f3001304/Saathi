import type { BeatHub } from "../http/beat-hub.js";
import type { SandboxView } from "../http/chat-beat.js";

/**
 * Whether the shopper is being shown the sandbox window.
 *
 * DECISION: research does not open a stage. Reading four Amazon pages to work
 * out which SSD is worth recommending is the agent doing its job, not a
 * performance — and a window put on screen for it invites a shopper to watch,
 * to take the wheel mid-read, and to wonder why nothing is happening on the
 * page between two model round trips. Worse, it makes the *research* the
 * thing they are looking at, when the thing that matters is the answer.
 *
 * The window reappears the moment it is theirs to act on: a tapped card is a
 * checkout, and a checkout is exactly where a person must be able to see the
 * page, take the wheel, and finish the payment step themselves.
 *
 * This is a port, not a flag on a service, because the two callers are turn
 * steps and they should be able to say which phase they are without knowing
 * that a browser exists.
 */
export interface WindowStage {
  /** The window is a tool this turn, and nobody is watching it. */
  conceal(): void;
  /** The window is theirs to watch and to take. */
  reveal(): void;
  /**
   * This errand still needs the window. The idle sweep answered "is anybody
   * there?" from the frame-stream watcher count, which is false for the whole
   * of a concealed research phase — so the first live run of the split had its
   * window reaped mid-errand. The returned function releases the hold.
   */
  hold(): () => void;
}

/** Whoever can say what the window on screen currently looks like. */
export interface WindowShower {
  /** The window as it stands, or `null` on a host with none to show. */
  view(): SandboxView | null;
}

/**
 * The window is open and may be being watched now, so the log says so now.
 * Written only when the run settled, it left a shopper who opened the Windows
 * tab mid-errand restoring a chat that knew which card had been picked and not
 * that anything was fetching it, and so being asked to launch the shop it was
 * already standing in. The settle-time record stays; the later state wins.
 */
export function showWindow(hub: BeatHub, shower: WindowShower): void {
  const session = shower.view();
  if (session !== null) hub.emit({ kind: "sandbox", session });
}

/** For the turn steps that never touch a window. */
export const OPEN_STAGE: WindowStage = {
  conceal: () => undefined,
  reveal: () => undefined,
  hold: () => () => undefined,
};
