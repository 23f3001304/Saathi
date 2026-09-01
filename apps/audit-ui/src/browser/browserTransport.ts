// The seam for the sandbox card, shaped like the conversation's own
// (assistantTransport.ts): the card folds a stream of signals and never learns
// whether a timer or a socket produced them, so the fixture reel and a live
// agent-host session render through exactly the same code path.
import type { BrowserBlackout, BrowserSessionView } from "./browserSession.ts";

export type BrowserFrame = {
  /** A `data:` URL, already redacted by the host. JPEG live, PNG off the shutter. */
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** How many boxes the host painted out of this frame. */
  readonly redacted: number;
  /**
   * True when the host forwarded the browser's own bytes because its
   * classifier found nothing on this frame to paint out. The check ran either
   * way; only the repainting was skipped.
   */
  readonly passthrough: boolean;
};

/**
 * What the viewport can send. Coordinates, characters and named keys — no
 * selector, no element id. The page cannot aim at a field; it can only say
 * where the pointer went, and the host decides what was under it.
 */
export type RelayInput =
  | { readonly kind: "click"; readonly x: number; readonly y: number }
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "key"; readonly name: string }
  | { readonly kind: "scroll"; readonly dy: number };

export type RelayRefusal = {
  readonly ok: false;
  /** The harness's own sentence, verbatim. Never rewritten here. */
  readonly human: string;
  readonly handOffNatively: boolean;
  readonly nativeEntry: string | null;
  readonly fronted: boolean;
  /** Where "yours" is: a window on this machine, or a container elsewhere. */
  readonly surface: "native-window" | "container" | null;
  /** The page to open in the shopper's own browser, when there is no window. */
  readonly openUrl: string | null;
};

export type RelayOutcome = { readonly ok: true } | RelayRefusal;

export type BrowserStatus =
  /** The scripted reel, on purpose. */
  | "fixtures"
  | "connecting"
  | "live"
  /** The host answered, and refused: this page has no sandbox key. */
  | "unauthorized"
  /** The host is unreachable; the reel is standing in and says so. */
  | "offline";

export type BrowserSignal =
  | { readonly kind: "session"; readonly view: BrowserSessionView | null }
  | { readonly kind: "frame"; readonly frame: BrowserFrame }
  /** No frame was taken. The card draws a curtain rather than a stale picture. */
  | { readonly kind: "blackout"; readonly blackout: BrowserBlackout }
  | { readonly kind: "status"; readonly status: BrowserStatus };

export type BrowserEmit = (signal: BrowserSignal) => void;

export interface BrowserTransport {
  /** Whether a real sandbox window is behind this, for copy that must not lie. */
  readonly live: boolean;
  start: (emit: BrowserEmit) => () => void;
  relay: (input: RelayInput) => Promise<RelayOutcome>;
  /** User-initiated only. Nothing here resumes on the user's behalf. */
  resume: () => Promise<void>;
  /**
   * The user asking for the wheel mid-drive. The host already had the edge —
   * `POST /browser/takeover` raises the same handoff a refusal does — what was
   * missing was any way to ask for it, so "you can always take over" was true
   * of the server and false of the screen. It grants no new reach: the relay
   * still goes through the same classifier, and a credential is still refused.
   */
  takeover: () => Promise<void>;
  /**
   * Hand this page to the human. With a window on their desktop that raises
   * it; in a container there is none, so the host answers with the URL to open
   * in their own browser — for passkeys and anything else bound to the device.
   */
  front: () => Promise<boolean>;
}

export const SANDBOX_REFUSED =
  "agent-host refused this page's sandbox request: it has no session key. The key is minted when agent-host boots and handed to the Bench over GET /browser/handshake, which only answers the origins that host was told to trust. Nothing is broken here and no window was opened — this page simply is not the one holding the key.";

export const REEL_HAS_NO_WINDOW =
  "These frames are the fixture reel, not a live window — there is nothing behind them to click. Start agent-host to drive the real sandbox.";

/**
 * The card's own provenance line, in the two cases where the panel is showing
 * a script. §4.4's honesty rule reaches the sandbox last and hardest: this
 * card carries a URL bar, a driver chip and an action list, so an unlabelled
 * reel does not read as a placeholder — it reads as a shop the agent visited.
 */
export const SAMPLE_NO_HOST =
  "No sandbox is connected, so this is a scripted demo. No window was opened, no shop was visited, and nothing in the list below happened.";

export const SAMPLE_HOST_GONE =
  "agent-host stopped answering, so the live window is gone from this panel and a scripted demo is standing in. Nothing below is a reading of a real page. The card returns to the live window on its own when the host answers again.";
