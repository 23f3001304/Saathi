import type { BrowserSession, PageDom, Waiter } from "@covenant/browser-drive";
import { UserDriveViolation } from "@covenant/browser-drive";

import type { BrowserService } from "./browser-service.js";
import { SETTLE_MS, settledRead } from "./settled-read.js";
import type { KnownAddress } from "./web-address-fill.js";
import { fillKnownAddress } from "./web-address-fill.js";
import { checkCartAgainst } from "./web-cart-check.js";
import { handOver } from "./web-handover.js";
import type { WebFindings } from "./web-listing.js";
import type { WebProgress } from "./web-progress.js";
import type { WebPageView } from "./web-page-view.js";
import { PageRefs, WEB_PROVENANCE } from "./web-page-view.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import {
  NO_WINDOW,
  pageMoved,
  theirTurn,
  webFailure,
  webOk,
  webRefusal,
} from "./web-result.js";

/**
 * Puppeteer's `keyboard.type` presses Return for a newline, so a search is one
 * guarded `type` and not a second, ungated key path into the window. The field
 * is classified before the newline lands, so a login form's boxes are refused
 * before a character is typed and this can submit nothing the agent may not.
 */
const SUBMIT = "\n";

/**
 * Shopping the open web, as six operations the buyer agent can call.
 *
 * Every one of them goes through `GuardedPage`, so the guarantees are the ones
 * the sandbox already had rather than a second set written for tools: the
 * classifier decides what may be typed and clicked, a block moves the wheel to
 * the user, and nothing here can reach a payment rail because nothing here can
 * reach anything but a DOM.
 *
 * Every read is checked first for the two things that end the agent's turn at
 * the window — a bot check and the payment step — and either hands it over
 * rather than being reported as a page. See `web-handover.ts`.
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
      return (
        handOver(session, dom, (why) => this.progress.recordHandover(why)) ??
        webOk({ page: this.viewOf(dom), provenance: WEB_PROVENANCE })
      );
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
      const dom = await settledRead(session, this.waiter, SETTLE_MS);
      // A search navigates too, and the page it lands on is where the window
      // went — the report of the errand names it because this recorded it.
      this.trail.record(dom.url);
      return (
        handOver(session, dom, (why) => this.progress.recordHandover(why)) ??
        webOk({
          searched: query,
          page: this.viewOf(dom),
          provenance: WEB_PROVENANCE,
        })
      );
    });
  }

  /** The only click the agent has, and it is still judged: aimed at a page's
   *  own "Place order", `FieldClassifier` refuses it — the button commits a
   *  payment, so pressing it is the user's act. */
  addToCart(ref: string): Promise<WebResult> {
    return this.onSession(async (session) => {
      const selector = this.refs.selectorOf(ref);
      if (selector === null) {
        return webFailure(
          "unknown_ref",
          `Nothing on the last page read was called ${ref}. Call web_read and use a ref from that reading.`,
        );
      }
      const clicked = await session.page().click(selector);
      if (!clicked.ok) {
        return webRefusal(clicked);
      }
      const dom = await settledRead(session, this.waiter, SETTLE_MS);
      this.trail.record(dom.url);
      const handed = handOver(session, dom, (why) =>
        this.progress.recordHandover(why),
      );
      if (handed !== null) return handed;
      // Click landed, page settled, window still ours: the basket fact.
      this.progress.recordCarted();
      const page = this.viewOf(dom);
      return webOk({ clicked: ref, page, provenance: WEB_PROVENANCE });
    });
  }

  cart(): Promise<WebResult> {
    return this.onSession((session) =>
      checkCartAgainst(session, this.browser.ceiling),
    );
  }

  /**
   * Fills the delivery fields this host already knows the answers to, and only
   * those. The values come from `TraitMemory` — what the shopper themselves
   * stated — never from the model and never from the page, so there is no
   * argument here for a model to choose. A field with no trait behind it is
   * left blank and named in the result; a field the classifier calls sensitive
   * is refused there, as it is for every other keystroke this class makes.
   */
  fillAddress(): Promise<WebResult> {
    return this.onSession((session) =>
      fillKnownAddress(session, this.address, this.waiter, (slots) =>
        this.progress.recordFilled(slots),
      ),
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
