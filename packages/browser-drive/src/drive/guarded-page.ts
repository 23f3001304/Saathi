import type { CartDom } from "../cart/cart-dom.js";
import type {
  Classification,
  ElementDescriptor,
} from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { HandoffController } from "../handoff/handoff-controller.js";
import type { Journal } from "../journal.js";
import type { DrivenPage } from "../ports.js";
import type { PageDom } from "../read/page-dom.js";
import type { SessionStateMachine } from "../session-state.js";
import type { NavigationPolicy } from "./navigation-policy.js";
import type { ActionResult, NavigationOutcome, Refusal } from "./refusal.js";
import { missing, navigationRefusal, ok, reasonFor } from "./refusal.js";

/**
 * The only surface the agent is given. There is no escape hatch on this class
 * and no reference to the underlying page leaves it, so "the agent never types a
 * credential" is a property of the code path rather than a promise about the
 * prompt (§10.2 hook 1, moved from the tool boundary to the DOM boundary).
 *
 * DECISION: a *sensitive-context* destination is never refused, only flagged —
 * reading a checkout page is how `CartInspector` checks the cap at all, and
 * refusing to look would break the covenant check while protecting nothing.
 * `NavigationPolicy` is the other axis and it does refuse.
 */
export class GuardedPage {
  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
    private readonly handoff: HandoffController,
    private readonly policy: NavigationPolicy,
  ) {}

  url(): string {
    return this.page.url();
  }

  async navigate(url: string): Promise<ActionResult<NavigationOutcome>> {
    this.state.assertAgentMayAct("navigate");
    const decision = this.policy.check(url);
    if (!decision.allowed) {
      this.record("action.blocked", this.page.url(), {
        action: "navigate",
        target: url,
        rule: decision.rule,
      });
      return navigationRefusal(decision.rule, decision.human);
    }
    await this.page.goto(url);
    const landed = this.page.url();
    const flagged = this.classifier.contextOfUrl(landed);
    this.record("page.navigated", landed, { requested: url, flagged });
    if (flagged !== null) {
      this.record("context.flagged", landed, {
        reason: flagged,
        note: "readable, not touchable",
      });
    }
    return ok({ url: landed, flagged });
  }

  async type(selector: string, text: string): Promise<ActionResult<null>> {
    this.state.assertAgentMayAct("type");
    const guarded = await this.guard(selector, "type", { chars: text.length });
    if (guarded !== null) {
      return guarded;
    }
    await this.page.typeInto(selector, text);
    this.record("page.typed", this.page.url(), {
      selector,
      chars: text.length,
    });
    return ok(null);
  }

  async click(selector: string): Promise<ActionResult<null>> {
    this.state.assertAgentMayAct("click");
    const guarded = await this.guard(selector, "click", {});
    if (guarded !== null) {
      return guarded;
    }
    await this.page.clickOn(selector);
    this.record("page.clicked", this.page.url(), { selector });
    return ok(null);
  }

  /** Reading is not acting: allowed in agent-drive, journalled, never blocked. */
  readText(selector: string): Promise<ActionResult<string>> {
    return this.read(selector, () => this.page.readText(selector));
  }

  /** Reads a field's live value — how the agent checks what it did not type. */
  readValue(selector: string): Promise<ActionResult<string>> {
    return this.read(selector, () => this.page.readValue(selector));
  }

  /** The whole page as text, links and controls. A read: gated, never blocked
   *  — what may be *done* with what it finds is decided one call later. */
  stopLoading(): Promise<void> {
    // Watching-side, not acting-side: cancelling a stuck load drives nothing.
    return this.page.stopLoading();
  }

  async readPage(): Promise<PageDom> {
    this.state.assertAgentMayAct("read_page");
    const dom = await this.page.readPage();
    this.record("page.read", dom.url, {
      selector: "page",
      blocks: dom.blocks.length,
      controls: dom.controls.length,
    });
    return dom;
  }

  private async read(
    selector: string,
    from: () => Promise<string | null>,
  ): Promise<ActionResult<string>> {
    this.state.assertAgentMayAct("read");
    const text = await from();
    if (text === null) {
      return this.refuse(missing(selector), selector, "read");
    }
    this.record("page.read", this.page.url(), { selector, chars: text.length });
    return ok(text);
  }

  async scrapeCart(): Promise<CartDom> {
    this.state.assertAgentMayAct("scrape_cart");
    const dom = await this.page.scrapeCart();
    const rows = dom.rows.length;
    this.record("page.read", dom.url, { selector: "cart", rows });
    return dom;
  }

  /** Non-null means the action is refused; the caller returns it untouched. */
  private async guard(
    selector: string,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Promise<Refusal | null> {
    const descriptor = await this.page.describe(selector);
    if (descriptor === null) {
      return this.refuse(missing(selector), selector, action);
    }
    const verdict = this.classifier.classify(descriptor);
    if (!verdict.sensitive) {
      return null;
    }
    return this.block(descriptor, verdict, action, detail);
  }

  /** Journals, moves the wheel to the user, and hands back a sayable sentence. */
  private block(
    descriptor: ElementDescriptor,
    verdict: Classification,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Refusal {
    const url = this.page.url();
    this.record("action.blocked", url, {
      ...detail,
      action,
      selector: descriptor.selector,
      rule: verdict.rule,
      category: verdict.category,
      handoff: verdict.handoff,
      human: verdict.human, // The sentence, so the trail reads without the rule table.
    });
    const reason = verdict.handoff;
    const raised = reason === null ? null : this.handoff.raise(reason, url);
    return {
      ok: false,
      reason: reasonFor(verdict),
      category: verdict.category,
      rule: verdict.rule,
      human: verdict.human,
      handoff: raised,
      handoffReason: verdict.handoff,
    };
  }

  private refuse(refusal: Refusal, selector: string, action: string): Refusal {
    this.record("action.blocked", this.page.url(), {
      action,
      selector,
      rule: refusal.rule,
    });
    return refusal;
  }

  private record(
    kind: Parameters<Journal["append"]>[0]["kind"],
    url: string,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.journal.append({ kind, url, detail }, this.state.current());
  }
}
