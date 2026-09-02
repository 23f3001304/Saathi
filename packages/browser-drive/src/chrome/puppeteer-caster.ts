import type { CDPSession, Frame, Page } from "puppeteer";

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
 *
 * DECISION: the cast follows the page across navigations. A cross-process
 * navigation (a checkout hopping to a sign-in origin) swaps the target under
 * the CDP session, the screencast events simply stop, and no error says so —
 * the live view froze on the last painted frame of the old process for as
 * long as anybody watched. A main-frame navigation now restarts the cast on
 * the page's current target, coalesced so a redirect chain restarts it once,
 * at the end, rather than per hop.
 */
const RESTART_COALESCE_MS = 180;

export class PuppeteerCaster implements Caster {
  private session: CDPSession | null = null;
  private held: {
    readonly settings: CastSettings;
    readonly onFrame: (frame: CastFrame) => void;
  } | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onNavigated = (frame: Frame): void => {
    if (this.held === null || frame !== this.page.mainFrame()) return;
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.reattach();
    }, RESTART_COALESCE_MS);
    this.restartTimer.unref?.();
  };

  constructor(private readonly page: Page) {}

  async start(
    settings: CastSettings,
    onFrame: (frame: CastFrame) => void,
  ): Promise<void> {
    await this.stop();
    this.held = { settings, onFrame };
    this.page.on("framenavigated", this.onNavigated);
    await this.attach();
  }

  private async attach(): Promise<void> {
    const held = this.held;
    if (held === null) return;
    const session = await this.page.createCDPSession();
    this.session = session;
    const mediaType =
      held.settings.format === "jpeg" ? "image/jpeg" : "image/png";
    session.on("Page.screencastFrame", (event) => {
      held.onFrame({
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
      format: held.settings.format,
      quality: held.settings.quality,
      maxWidth: held.settings.maxWidth,
      maxHeight: held.settings.maxHeight,
      everyNthFrame: held.settings.everyNthFrame,
    });
  }

  /** The navigation landed; the old session may be a corpse. Tear it down
   *  without ceremony and cast from the page's current target. */
  private async reattach(): Promise<void> {
    if (this.held === null) return;
    const old = this.session;
    this.session = null;
    if (old !== null) {
      await old.send("Page.stopScreencast").catch(() => undefined);
      await old.detach().catch(() => undefined);
    }
    await this.attach().catch(() => undefined);
  }

  async ack(frame: number): Promise<void> {
    // A stream whose ack was lost stalls silently, which is worse than one
    // that stops: the caller notices a stop and falls back to the shutter.
    await this.session?.send("Page.screencastFrameAck", { sessionId: frame });
  }

  async stop(): Promise<void> {
    this.held = null;
    this.page.off("framenavigated", this.onNavigated);
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const session = this.session;
    this.session = null;
    if (session === null) return;
    await session.send("Page.stopScreencast").catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
}
