import type { Waiter } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import type { Picture } from "./web-picture.js";
import { NO_WINDOW_OPEN, pictureOf, withheld } from "./web-picture.js";
import type { WebResult } from "./web-result.js";
import { NO_WINDOW, webFailure } from "./web-result.js";

/**
 * The errand's eyes. Every window move already comes back with the picture it
 * left the window in; this is the same look, asked for on its own, when the
 * model wants to see the page again without touching it.
 *
 * Both go through `pictureOf`, so there is one capture path in this host and
 * one place the shutter and the redaction are honoured.
 */
export class GlanceVerbs {
  constructor(
    private readonly browser: BrowserService,
    private readonly waiter: Waiter,
  ) {}

  /** The look every window move gets. Never throws and never fails a move:
   *  a window that could not be photographed says so in the note. */
  async picture(): Promise<Picture> {
    const session = this.browser.current();
    if (session === null) return withheld(NO_WINDOW_OPEN);
    return await pictureOf(session, this.waiter);
  }

  async glance(): Promise<{ result: WebResult; image: string | null }> {
    if (this.browser.current() === null) {
      return { result: NO_WINDOW, image: null };
    }
    const seen = await this.picture();
    if (seen.image === null) return { result: blind(seen.note), image: null };
    return { result: glanced(seen), image: seen.image };
  }
}

/**
 * A glance whose whole answer was the picture, and no picture came. Every
 * withheld note lands here, not only the one that means the shutter broke: a
 * body saying `ok` with a sentence promising a screenshot that is not attached
 * would have the model reading its next move off the last picture it saw. The
 * note is carried through as the reason, so "no picture came back" has one
 * answer here rather than two contradictory halves of one.
 */
function blind(note: string): WebResult {
  return webFailure(
    "no_picture",
    "No picture of the window came back, so there is nothing to look at. " +
      "Read the page with web_read instead, or glance again after your next " +
      "move.",
    { picture: note },
  );
}

function glanced(seen: Picture): WebResult {
  return {
    isError: false,
    body: {
      ok: true,
      width: seen.width,
      height: seen.height,
      grid_px: 100,
      redacted_fields: seen.redacted,
      picture: seen.note,
      note:
        "The screenshot follows as an image. Orange lines every 100px; " +
        "coordinates read off the numbers on the edges. Aim web_press " +
        "and web_write in these pixels.",
    },
  };
}
