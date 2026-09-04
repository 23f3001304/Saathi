import type { GlanceVerbs } from "./web-glance.js";
import type { WebShopper } from "./web-shopper.js";
import type { WebResult } from "./web-result.js";
import { webFailure } from "./web-result.js";

/** Where the mouse may be sent, and what it does when it gets there. */
export type MouseMove =
  | { readonly do: "click"; readonly x: number; readonly y: number }
  | { readonly do: "scroll"; readonly by: number };

/** What the keyboard may send: characters, or one named key. */
export type KeyMove =
  | { readonly type: string }
  | { readonly press: string };

/**
 * The sandbox's mouse and keyboard, as two tools.
 *
 * DECISION: the model drives a POINTER, not a DOM. It looks at the window
 * with web_glance - a screenshot with a coordinate grid drawn on it - reads
 * the point it wants off the picture, and sends the mouse there. That is how
 * a person uses a browser, it works on canvas, shadow DOM and custom widgets
 * that no selector reaches, and it collapses three half-tools (press, write,
 * scroll) into the two devices they were pretending not to be.
 *
 * What does NOT change is the judge: every click still resolves through the
 * hit-test and the same FieldClassifier, so a pointer sent at a pay button
 * is refused exactly as a selector was. Aiming freely is safe precisely
 * because aim is not permission.
 *
 * Every move answers with a fresh picture, because a move whose result you
 * cannot see is a move you have to guess about.
 */
export class Devices {
  constructor(
    private readonly shopper: WebShopper,
    private readonly glance: GlanceVerbs,
  ) {}

  async mouse(move: MouseMove): Promise<{
    result: WebResult;
    image: string | null;
  }> {
    const done =
      move.do === "click"
        ? await this.shopper.press(move.x, move.y)
        : await this.shopper.scroll(move.by);
    return this.andLook(done);
  }

  async keyboard(move: KeyMove): Promise<{
    result: WebResult;
    image: string | null;
  }> {
    if ("type" in move) {
      return this.andLook(await this.shopper.typeHere(move.type));
    }
    return this.andLook(await this.shopper.pressKey(move.press));
  }

  /** The move, then the window as the move left it. A refusal is answered
   *  with a picture too: seeing why it was refused is the point. */
  private async andLook(
    result: WebResult,
  ): Promise<{ result: WebResult; image: string | null }> {
    const seen = await this.glance.glance().catch(() => null);
    return { result, image: seen?.image ?? null };
  }
}

/** A named key the sandbox will forward, or a refusal naming the set. */
export function refuseKey(name: string, allowed: readonly string[]): WebResult {
  return webFailure(
    "unknown_key",
    `The sandbox does not send "${name}". It sends: ${allowed.join(", ")}. ` +
      "For ordinary characters use type instead.",
  );
}
