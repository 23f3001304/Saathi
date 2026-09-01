import type { SensitiveCategory } from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { FieldSnapshot, ObservablePage, Rect } from "../ports.js";
import type { SessionState } from "../session-state.js";
import { decodePng, encodePng } from "./png.js";
import { paintRects } from "./redact.js";

/** Who is holding the wheel right now, read per frame rather than held: the
 *  wheel moves mid-session and the policy has to move with it. */
export type Driver = () => SessionState;

/**
 * The default, and deliberately the strict one. A capture path that was never
 * told who is driving gets the agent's rules — every existing caller keeps the
 * behaviour it had, and forgetting to pass the state cannot loosen anything.
 */
export const AGENT_DRIVING: Driver = () => "agent-drive";

export interface Frame {
  /** Encoded image bytes with every sensitive rect already blanked. */
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  /** How many boxes were painted out — the number the UI and tests assert on. */
  readonly redacted: number;
  /**
   * True when these are the browser's own bytes, forwarded without being
   * decoded here. Only ever set on a frame the classifier found nothing to
   * paint on, where repainting would have been the identity function.
   */
  readonly passthrough: boolean;
}

export interface Blackout {
  readonly category: SensitiveCategory;
  readonly rule: string;
  readonly human: string;
}

export type Capture =
  | { readonly kind: "frame"; readonly frame: Frame }
  | { readonly kind: "blackout"; readonly blackout: Blackout };

/**
 * DECISION, reversing "stop the shutter on protected focus".
 *
 * Nothing produces a `Blackout` any more. The type and the `Capture` member
 * stay because the wire and the card still model one, and because the policy
 * is a decision rather than a deletion — but no capture path returns one, and
 * none may be switched on for the demo.
 *
 * Two reasons, and the first is a bug rather than a preference. Stopping was a
 * *latch*: the stop handed the window to the polled shutter through a path
 * that acknowledged a frame to a CDP session it had just detached, an ack that
 * can neither resolve nor reject, inside the `finally` that clears the feed's
 * `busy` flag. Measured on a real checkout page: the action list kept updating
 * and the picture never came back for the life of the window. The second is
 * the product: a card that goes black exactly when the shopper reaches the
 * interesting part of a purchase is the moment the demo needs most.
 *
 * The redaction claim is unchanged and is now carried the way §5.13 always
 * described it — the sensitive rectangles are painted opaque in the PNG bytes
 * before they leave, focused field included. What is given up is the stronger
 * "the pixels were never read into this process at all"; what is kept is that
 * they never leave it un-painted, and that the agent may not touch the field
 * in any state.
 */

/** Deduped, because a before/after union lists an unmoved field twice. */
export function sensitiveRects(
  classifier: FieldClassifier,
  fields: readonly FieldSnapshot[],
): readonly Rect[] {
  const unique = new Map<string, Rect>();
  for (const field of fields) {
    if (!classifier.isSensitive(field.descriptor)) continue;
    const box = field.rect;
    unique.set(`${box.x},${box.y},${box.width},${box.height}`, box);
  }
  return [...unique.values()];
}

/**
 * The polled frame path, and the one place where "the agent never handles your
 * password" has to hold for pixels rather than for keystrokes.
 *
 * Viewing needs no state gate: a screenshot changes nothing, and the whole
 * point of a watchable sandbox is that the user can see it in either drive
 * state. What it does need is redaction, applied by the same `FieldClassifier`
 * that decides what may be typed into — one policy, two consequences.
 *
 * DECISION: rects come from one `getBoundingClientRect` pass inside the page
 * rather than from `ElementHandle.boundingBox()` per element. Two reasons, both
 * load-bearing: `boundingBox` is document-relative while a screenshot is
 * viewport-relative, so scrolled pages would mask the wrong pixels; and one
 * evaluate is atomic, where N round-trips at two frames a second leave a window
 * for the DOM to move under the mask.
 *
 * DECISION: when a protected field holds focus the shutter does not open. That
 * is a different promise from redaction and a stronger one. Redaction means the
 * pixels were read into this process and then painted over — correct, but it
 * rests on the mask being in the right place. A blackout means `screenshot()`
 * was never called, so the characters being typed were never in an image, never
 * in a buffer, and never one bug away from a log. It is what makes relaying a
 * credential into a container defensible: we cannot show you your own password
 * because for those keystrokes we stop looking.
 */
export class FrameCapture {
  constructor(
    private readonly page: ObservablePage,
    private readonly classifier: FieldClassifier,
    private readonly driver: Driver = AGENT_DRIVING,
  ) {}

  /**
   * DECISION: the shutter rule is split on who is driving.
   *
   * While the *agent* drives, none of this moves: a protected field takes
   * focus and no picture is taken at all, because the credential must never
   * reach this process. While the *user* drives it inverts, and has to. The
   * person watching the stream and the person typing the secret are the same
   * person, at the same keyboard, in their own tab — so blacking out their own
   * typing protects nobody and blinds the one person entitled to look. It made
   * "take the wheel and pay" impossible: the shopper was handed a payment form
   * they could not see.
   *
   * So user-drive shows the window as it is, and the card says so in as many
   * words. What does not move: the agent is refused those fields in every
   * state, frames are never written down (the beat log carries actions only —
   * pinned by beat-rehydrate.test.ts), and the moment the wheel goes back the
   * `driver()` read on the next frame puts the shutter rule straight back.
   */
  async capture(): Promise<Capture> {
    if (this.driver() === "user-drive") return await this.yours();
    // Before and after, unioned. An element that appears between the field
    // read and the shutter would otherwise be photographed unmasked; only an
    // element that both appears and vanishes inside the same capture escapes,
    // which is not a field anyone is typing into.
    const before = await this.page.snapshotFields();
    const bytes = await this.page.screenshot();
    const after = await this.page.snapshotFields();
    const image = decodePng(bytes);
    const redacted = paintRects(
      image,
      sensitiveRects(this.classifier, [...before, ...after]),
    );
    return {
      kind: "frame",
      frame: {
        bytes: encodePng(image),
        mediaType: "image/png",
        width: image.width,
        height: image.height,
        redacted,
        passthrough: false,
      },
    };
  }

  /**
   * The window as it is, for the person driving it. The two field reads are
   * skipped along with the masking — there is nothing to mask — which is also
   * two fewer round trips per frame on the path where lag is felt as lag.
   */
  private async yours(): Promise<Capture> {
    const image = decodePng(await this.page.screenshot());
    return {
      kind: "frame",
      frame: {
        bytes: encodePng(image),
        mediaType: "image/png",
        width: image.width,
        height: image.height,
        redacted: 0,
        passthrough: false,
      },
    };
  }
}
