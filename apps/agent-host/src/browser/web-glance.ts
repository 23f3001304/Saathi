import type { Waiter } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import type { Picture } from "./web-picture.js";
import {
  NO_PICTURE,
  NO_WINDOW_OPEN,
  pictureOf,
  withheld,
} from "./web-picture.js";
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
    if (seen.note === NO_PICTURE) {
      return {
        result: webFailure(
          "no_picture",
          "No picture could be taken of the window right now. Read the page " +
            "instead, or try the glance again after your next move.",
        ),
        image: null,
      };
    }
    return { result: glanced(seen), image: seen.image };
  }
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
