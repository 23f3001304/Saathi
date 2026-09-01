import type { CDPSession, Page } from "puppeteer";

import type { CastFrame, CastSettings, Caster } from "../ports.js";

/**
 * `Page.startScreencast`, and the only file that knows the wire names.
 *
 * DECISION: a CDP session of this process's own, on the pipe that is already
 * there. No port is opened, nothing is published, and the frames arrive on the
 * same `docker run -i` stdio the rest of the session rides — which is the
 * reason this is a screencast and not VNC. A pixel pipe out of the container
 * would carry a password field's contents past the classifier intact; these
 * frames arrive here, in the process that holds the redactor, and every one is
 * judged before it goes anywhere.
 *
 * DECISION: `ack` is a separate method rather than something this file does on
 * receipt. Chrome holds at most a few unacknowledged frames and then stops
 * producing, so acknowledging only once the caller has finished with a frame
 * makes Chrome itself the backpressure — the alternative, acking on arrival,
 * would have this process queueing frames it cannot keep up with.
 */
export class PuppeteerCaster implements Caster {
  private session: CDPSession | null = null;

  constructor(private readonly page: Page) {}

  async start(
    settings: CastSettings,
    onFrame: (frame: CastFrame) => void,
  ): Promise<void> {
    await this.stop();
    const session = await this.page.createCDPSession();
    this.session = session;
    const mediaType = settings.format === "jpeg" ? "image/jpeg" : "image/png";
    session.on("Page.screencastFrame", (event) => {
      onFrame({
        bytes: Buffer.from(event.data, "base64"),
        mediaType,
        ack: event.sessionId,
        // The viewport these pixels are of, not the size they were encoded at:
        // `maxWidth` may have scaled the image down, and a relayed click is in
        // page coordinates. The UI scales by the ratio, so it must be told the
        // space the coordinates live in.
        width: event.metadata.deviceWidth,
        height: event.metadata.deviceHeight,
      });
    });
    await session.send("Page.startScreencast", {
      format: settings.format,
      quality: settings.quality,
      maxWidth: settings.maxWidth,
      maxHeight: settings.maxHeight,
      everyNthFrame: settings.everyNthFrame,
    });
  }

  async ack(frame: number): Promise<void> {
    // A stream whose ack was lost stalls silently, which is worse than one
    // that stops: the caller notices a stop and falls back to the shutter.
    await this.session?.send("Page.screencastFrameAck", { sessionId: frame });
  }

  async stop(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session === null) return;
    await session.send("Page.stopScreencast").catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
}
