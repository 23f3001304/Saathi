import { withCoordinateGrid } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import type { WebResult } from "./web-result.js";
import { NO_WINDOW, webFailure } from "./web-result.js";

/**
 * The errand's eyes. One call returns the window's own REDACTED screenshot
 * with the coordinate grid burned in, as a data URL the provider session
 * attaches to the model's next turn. The redaction is the point: this is
 * the same capture path the shopper's card paints from, so a field the
 * classifier blanks is blank here too, and no model sees a pixel the person
 * would not.
 */
export class GlanceVerbs {
  constructor(private readonly browser: BrowserService) {}

  async glance(): Promise<{ result: WebResult; image: string | null }> {
    const session = this.browser.current();
    if (session === null) return { result: NO_WINDOW, image: null };
    const capture = await session.screenshot();
    if (capture.kind !== "frame" || capture.frame.mediaType !== "image/png") {
      return {
        result: webFailure(
          "no_picture",
          "No picture could be taken of the window right now. Read the page " +
            "instead, or try the glance again after your next move.",
        ),
        image: null,
      };
    }
    const annotated = withCoordinateGrid(capture.frame.bytes);
    const image = `data:image/png;base64,${Buffer.from(annotated).toString("base64")}`;
    return {
      result: {
        isError: false,
        body: {
          ok: true,
          width: capture.frame.width,
          height: capture.frame.height,
          grid_px: 100,
          redacted_fields: capture.frame.redacted,
          note:
            "The screenshot follows as an image. Orange lines every 100px; " +
            "coordinates read off the numbers on the edges. Aim web_press " +
            "and web_write in these pixels.",
        },
      },
      image,
    };
  }
}
