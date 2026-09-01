import type { CartCovenant } from "../cart/cart-covenant.js";
import type { CartReading } from "../cart/cart-dom.js";
import type { CartInspector } from "../cart/cart-inspector.js";
import type { HandoffController } from "../handoff/handoff-controller.js";
import type { Journal } from "../journal.js";
import type { Handoff, SessionStateMachine } from "../session-state.js";
import type { GuardedPage } from "./guarded-page.js";
import type { ActionResult } from "./refusal.js";

/**
 * Scrape → read → check → hand off or refuse. Kept apart from `BrowserSession`
 * so the session owns a browser lifetime and this owns the last decision before
 * money; neither description needs an "and" (§12-S).
 */
export class FinalReview {
  constructor(
    private readonly inspector: CartInspector,
    private readonly covenant: CartCovenant,
    private readonly handoff: HandoffController,
    private readonly journal: Journal,
    private readonly state: SessionStateMachine,
  ) {}

  async inspect(page: GuardedPage): Promise<CartReading> {
    const dom = await page.scrapeCart();
    const reading = this.inspector.inspect(dom);
    this.journal.append(
      {
        kind: "cart.inspected",
        url: dom.url,
        detail: {
          total_paise: reading.totalPaise,
          confidence: reading.confidence,
          basis: reading.basis,
          items: reading.items.length,
        },
      },
      this.state.current(),
    );
    return reading;
  }

  async run(page: GuardedPage): Promise<ActionResult<Handoff>> {
    const reading = await this.inspect(page);
    return this.handoff.requestFinalReview(this.covenant.check(reading));
  }
}
