import type { FieldClassifier } from "../field/field-classifier.js";
import type {
  CastFrame,
  CastSettings,
  Caster,
  FieldSnapshot,
  ObservablePage,
  Rect,
} from "../ports.js";
import { AGENT_DRIVING, sensitiveRects } from "./frame-capture.js";
import type { Blackout, Driver, Frame } from "./frame-capture.js";
import { paints } from "./redact.js";

/**
 * JPEG, because the fast path forwards the browser's own bytes and a PNG of a
 * real page is three times the size for no visible gain at this scale. The
 * slow path never sees these bytes: it takes a PNG shutter of its own, so
 * nothing is ever repainted in a lossy format.
 */
export const CAST_SETTINGS: CastSettings = {
  format: "jpeg",
  quality: 70,
  maxWidth: 1280,
  maxHeight: 900,
  /**
   * DECISION: 1, and the rate is capped by pacing the acknowledgement instead.
   *
   * `everyNthFrame` is a cap on frames *produced*, which is the right lever
   * only if the page produces them steadily. Real pages do not: a page sits
   * still and then repaints once when the agent types a character. Measured on
   * the fixture shop mid-keystroke, `2` sent 0.7 frames a second where `1`
   * sent 2.9 — it was not halving a 60fps stream, it was dropping every other
   * thing that actually happened. Holding the ack back instead caps the busy
   * case exactly and costs a quiet page nothing, because a frame that arrives
   * long after the last one is never delayed at all.
   */
  everyNthFrame: 1,
};

/** The two halves of a live cast: the pipe, and the guard on the pipe. */
export interface LiveCast {
  readonly caster: Caster;
  readonly guard: ScreencastGuard;
}

/**
 * What the screencast path decided about one frame.
 *
 * `repaint` is the interesting one. These bytes are JPEG, and this package
 * cannot decode a JPEG to paint a box on it — so rather than ship a frame it
 * could not redact, it says so and the caller falls to the polled PNG shutter,
 * which can. The frame that produced this verdict is dropped, never sent.
 */
export type CastVerdict =
  | { readonly kind: "frame"; readonly frame: Frame }
  | { readonly kind: "blackout"; readonly blackout: Blackout }
  | { readonly kind: "repaint"; readonly rects: readonly Rect[] };

/**
 * The screencast guard.
 *
 * Every frame is classified before it leaves, exactly as a polled screenshot
 * is, and by the same `FieldClassifier` instance. What the fast path skips is
 * the *repainting*, never the check — and it skips it only in the case where
 * repainting provably changes nothing, because the classifier found no box to
 * paint. `paintRects(image, [])` is the identity function; forwarding the
 * bytes instead of decoding and re-encoding them to the same pixels is the
 * same frame, arrived at without the 41ms.
 *
 * DECISION: the rect set is the union of this frame's fields and the previous
 * frame's, for the same reason `FrameCapture` unions before and after. The
 * pixels are of the page at time T and the fields are read at T+δ, so a field
 * that vanished in between would otherwise escape. Carrying the previous read
 * forward closes that window to "appeared and vanished inside one frame
 * interval" — around 70ms here, where the polled path's equivalent hole is
 * 500ms wide. The screencast is the tighter of the two.
 */
export class ScreencastGuard {
  /** The previous frame's fields, so the union has something to union with. */
  private previous: readonly FieldSnapshot[] = [];

  constructor(
    private readonly page: ObservablePage,
    private readonly classifier: FieldClassifier,
    private readonly driver: Driver = AGENT_DRIVING,
  ) {}

  /** Read once before the cast starts, so the first frame is unioned too. */
  async prime(): Promise<void> {
    this.previous = await this.page.snapshotFields();
  }

  async judge(frame: CastFrame): Promise<CastVerdict> {
    // The same split `FrameCapture` makes, and for the same reason. It also
    // removes the two evaluates and every repaint stall from the path the
    // shopper is typing into, which is where lag is actually noticed.
    if (this.driver() === "user-drive") {
      return { kind: "frame", frame: passthroughFrame(frame) };
    }
    // No blackout branch: a protected field takes the slow path and is painted
    // out, it does not stop the picture. See frame-capture.ts.
    const fields = await this.page.snapshotFields();
    const rects = sensitiveRects(this.classifier, [
      ...this.previous,
      ...fields,
    ]);
    this.previous = fields;
    const paintable = rects.filter((rect) =>
      paints(rect, frame.width, frame.height),
    );
    if (paintable.length > 0) {
      return { kind: "repaint", rects: paintable };
    }
    return { kind: "frame", frame: passthroughFrame(frame) };
  }
}

function passthroughFrame(frame: CastFrame): Frame {
  return {
    bytes: frame.bytes,
    mediaType: frame.mediaType,
    width: frame.width,
    height: frame.height,
    redacted: 0,
    navigation: frame.navigation,
    passthrough: true,
  };
}
