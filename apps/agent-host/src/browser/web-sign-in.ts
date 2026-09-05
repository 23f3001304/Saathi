import type { BrowserSession, Waiter } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import { settledRead } from "./settled-read.js";
import type { WebProgress } from "./web-progress.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import { NO_WINDOW, pageMoved, webFailure, webOk } from "./web-result.js";
import { nextAfter } from "./sign-in-next.js";

/** What the sign-in verbs may know of the vault: a lookup by page URL. The
 *  entry crosses straight into the drive's own hands; nothing here logs,
 *  returns or rephrases it. */
export interface VaultReader {
  read(
    pageUrl: string,
  ): Promise<{ readonly username: string; readonly password: string } | null>;
}

/**
 * Sign in and enter a code, as tools the errand can call without ever
 * holding a value. `web_sign_in` takes no arguments: the vault is matched
 * by the page the window is on. `web_enter_code` takes the code the shopper
 * themselves typed into the chat, and the drive types it into the one box
 * the classifier calls a code box, nowhere else.
 */
export class SignInVerbs {
  constructor(
    private readonly browser: BrowserService,
    private readonly vault: VaultReader,
    private readonly waiter: Waiter,
    private readonly trail: WebTrail,
    private readonly progress: WebProgress,
  ) {}

  signIn(): Promise<WebResult> {
    return this.onSession(async (session) => {
      const entry = await this.vault.read(session.url());
      if (entry === null) {
        return webFailure(
          "no_stored_sign_in",
          "No sign-in is stored for this shop. Say so and hand the window " +
            "to the shopper; do not ask them for a password in chat.",
        );
      }
      const report = await session.signIn().into(entry);
      if (report.state === "no_password_field") {
        return webFailure(
          "no_sign_in_form",
          "No password box is on this page. Open the shop's own sign-in " +
            "page first, then call this again.",
        );
      }
      return this.settled(session, entry.username);
    });
  }

  enterCode(code: string): Promise<WebResult> {
    return this.onSession(async (session) => {
      const landed = await session.signIn().enterCode(code);
      if (!landed) {
        return webFailure(
          "no_code_box",
          "No code box is on this page. Read the page; if the shop still " +
            "challenges, the window is the shopper's.",
        );
      }
      const dom = await settledRead(session, this.waiter);
      this.trail.record(dom.url);
      return webOk({ code_entered: true, url: dom.url });
    });
  }

  /** After the submit settles: where the window went, and what (if anything)
   *  still challenges - the fact the close reads to ask for the code. */
  private async settled(
    session: BrowserSession,
    username: string,
  ): Promise<WebResult> {
    const dom = await settledRead(session, this.waiter);
    this.trail.record(dom.url);
    const challenge = await session.signIn().challenge();
    this.progress.recordSignedIn(challenge);
    const done = challenge === null;
    return webOk({
      signed_in: done,
      // Named only when the shop let us in. A page that is still challenging
      // is not an account you are on.
      signed_in_as: done ? username : null,
      challenge,
      url: dom.url,
      next: nextAfter(challenge),
    });
  }

  private async onSession(
    run: (session: BrowserSession) => Promise<WebResult>,
  ): Promise<WebResult> {
    const session = this.browser.current();
    if (session === null) return NO_WINDOW;
    try {
      return await run(session);
    } catch (cause) {
      return pageMoved(cause);
    }
  }
}
