import type { BrowserSession, PageDom, Waiter } from "@covenant/browser-drive";
import { UserDriveViolation } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import { settledRead } from "./settled-read.js";
import type { KnownAddress } from "./web-address-fill.js";
import { fillDelivery, readCart } from "./web-shopper-checkout.js";
import { observeWindow } from "./web-handover.js";
import type { WebFindings } from "./web-listing.js";
import type { WebProgress } from "./web-progress.js";
import type { WebPageView } from "./web-page-view.js";
import { PageRefs, WEB_PROVENANCE } from "./web-page-view.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import type { ActDeps } from "./web-acts.js";
import { pressAt, scrollPage, settleAfterAct, writeAt } from "./web-acts.js";
import {
  NO_WINDOW,
  pageMoved,
  theirTurn,
  webFailure,
  webOk,
  webRefusal,
} from "./web-result.js";

/** Puppeteer's `keyboard.type` presses Return for a newline, so a search is
 *  one guarded `type`, classified before the newline lands: no second key
 *  path into the window, and no submit the classifier did not see. */
const SUBMIT = "\n";

/**
 * Shopping the open web, as the operations the buyer agent can call. Every
 * one goes through `GuardedPage`, so the guarantees are the sandbox's own:
 * the classifier decides what may be typed and clicked, a block moves the
 * wheel to the user, and nothing here can reach anything but a DOM. A read
 * also names what the page looks like — a bot check, a sign-in wall, the
 * payment step — and only names it: acting on that is the model's own move,
 * `web_handover`.
 */
export class WebShopper {
  private readonly refs = new PageRefs();

  constructor(
    private readonly browser: BrowserService,
    private readonly trail: WebTrail,
    private readonly waiter: Waiter,
    private readonly findings: WebFindings,
    private readonly address: KnownAddress,
    /** What this host watched itself do at the window, this errand. */
    readonly progress: WebProgress,
  ) {}

  /** One read, seen twice: the view the model gets back, and the tiles the
   *  shopper is offered. One DOM pass, so they cannot disagree. */
  private viewOf(dom: PageDom): WebPageView {
    return this.refs.view(dom, this.findings.record(dom.listings));
  }

  open(url: string): Promise<WebResult> {
    return this.attempt(async () => {
      const landed = await this.browser.open(url);
      if (!landed.ok) {
        return webRefusal(landed);
      }
      this.refs.clear();
      this.trail.record(landed.value.url);
      return webOk({
        url: landed.value.url,
        sensitive_context: landed.value.flagged,
        provenance: WEB_PROVENANCE,
      });
    });
  }

  read(): Promise<WebResult> {
    return this.onSession(async (session) => {
      const dom = await settledRead(session, this.waiter);
      const page = this.viewOf(dom);
      return webOk({ page, ...observeWindow(dom), provenance: WEB_PROVENANCE });
    });
  }

  search(query: string): Promise<WebResult> {
    return this.onSession(async (session) => {
      const page = session.page();
      const box = this.refs.selectorOf(await this.searchRef(session));
      if (box === null) {
        return webFailure(
          "no_search_box",
          "This page has no search box the reader could find. Read it again, or open a URL that already carries the query.",
        );
      }
      const typed = await page.type(box, `${query}${SUBMIT}`);
      if (!typed.ok) {
        return webRefusal(typed);
      }
      // A search navigates too; the act tail records where the window went.
      return settleAfterAct(session, this.acts(), { searched: query });
    });
  }

  /** The ref click, still judged: aimed at a page's own "Place order",
   *  `FieldClassifier` refuses it — that press is the user's act. */
  addToCart(ref: string): Promise<WebResult> {
    return this.onSession(async (session) => {
      const selector = this.refs.selectorOf(ref);
      if (selector === null) {
        return webFailure(
          "unknown_ref",
          `Nothing on the last page read was called ${ref}. Refs are re-minted ` +
            "on every read and die on every navigation: call web_read now and " +
            "use a ref from that fresh reading, or web_press at a control's " +
            "own `at` coordinates from it.",
        );
      }
      const clicked = await session.page().click(selector);
      if (!clicked.ok) {
        return webRefusal(clicked);
      }
      return settleAfterAct(session, this.acts(), { clicked: ref }, true);
    });
  }

  /** Aim-by-point, judged at hit-test by the same classifier. */
  press(x: number, y: number): Promise<WebResult> {
    return this.onSession((session) => pressAt(session, this.acts(), x, y));
  }

  write(x: number, y: number, text: string): Promise<WebResult> {
    return this.onSession((session) =>
      writeAt(session, this.acts(), x, y, text),
    );
  }

  /** Looking below the fold. Judged only by the wheel: there is no target. */
  scroll(dy: number): Promise<WebResult> {
    return this.onSession((session) => scrollPage(session, this.acts(), dy));
  }

  private acts(): ActDeps {
    return {
      waiter: this.waiter,
      trail: this.trail,
      progress: this.progress,
      view: (dom) => this.viewOf(dom),
    };
  }

  cart(): Promise<WebResult> {
    return this.onSession((session) =>
      readCart(session, this.browser.ceiling, this.progress),
    );
  }

  fillAddress(): Promise<WebResult> {
    return this.onSession((session) =>
      fillDelivery(session, this.address, this.waiter, this.progress),
    );
  }

  private async searchRef(session: BrowserSession): Promise<string> {
    const dom = await settledRead(session, this.waiter);
    return this.refs.view(dom).search_ref ?? "";
  }

  private onSession(
    run: (session: BrowserSession) => Promise<WebResult>,
  ): Promise<WebResult> {
    const session = this.browser.current();
    if (session === null) {
      return Promise.resolve(NO_WINDOW);
    }
    return this.attempt(() => run(session));
  }

  /** Nothing that happens to a foreign page may end the shopper's turn: a
   *  handoff is the user's turn and says so, and anything else the DOM throws
   *  comes back as `page_moved` rather than failing the run. */
  private async attempt(run: () => Promise<WebResult>): Promise<WebResult> {
    try {
      return await run();
    } catch (cause) {
      return cause instanceof UserDriveViolation
        ? theirTurn(cause.state)
        : pageMoved(cause);
    }
  }
}
