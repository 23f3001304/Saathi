import type { ElementDescriptor } from "../field/element-descriptor.js";
import { isTextEntry } from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { Journal, JournalEventKind } from "../journal.js";
import type { InputPage } from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";
import type { RelayPolicy } from "../surface.js";
import type { ActionResult, Refusal } from "./refusal.js";
import { ok } from "./refusal.js";
import type { Gate } from "./relay-gate.js";
import { RelayGate } from "./relay-gate.js";
import { noTextTarget } from "./relay-refusals.js";

/**
 * What the UI says when the relay refuses on the native surface. It is a
 * statement of how the system is built, not an apology for a missing feature:
 * the keystrokes really do not traverse this process, because the only path
 * that could carry them is the one that just said no.
 */
export const NATIVE_ENTRY_SENTENCE =
  "Type it in the Saathi window — it just came to the front. Those keystrokes never pass through this page.";

/**
 * The closed set of named keys the relay will forward. Closed because the key
 * name reaches Chrome's input pipeline: an open string is a way to send chords
 * and browser shortcuts into the sandbox window from a page on another origin.
 * Printable characters do not appear here — they arrive through `type`.
 */
export const RELAY_KEYS = [
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
] as const;

export type RelayKey = (typeof RELAY_KEYS)[number];

/** The only thing a protected action is allowed to leave behind. */
const PROTECTED_DETAIL = { protected: true } as const;

/**
 * The user's half of the split. A click or a keystroke relayed from the chat
 * reaches the sandbox through here and nowhere else, and it is judged twice:
 * once by the state machine, which accepts input only while the user holds the
 * wheel, and once by `RelayGate`, which uses the *same* `FieldClassifier` the
 * agent is blocked by.
 *
 * DECISION: no `HandoffController` here, and no ability to raise one. The relay
 * runs during a handoff that is already open; a refusal inside it is a "not
 * through this pipe" — control has nowhere further to move.
 *
 * DECISION: a protected target is recorded as one line saying it happened. Not
 * the characters, not how many of them, not which field: `{ protected: true }`
 * and the fact that the user, not the agent, did it. The frame stream has
 * already gone dark by then, so the trail and the pictures agree about what
 * this session knows, which is nothing.
 */
export class UserInput {
  private readonly gate: RelayGate;

  constructor(
    private readonly page: InputPage,
    classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
    policy: RelayPolicy,
  ) {
    this.gate = new RelayGate(classifier, policy);
  }

  async click(x: number, y: number): Promise<ActionResult<null>> {
    this.state.assertUserMayAct("click");
    const gate = this.judge(await this.page.describeAt(x, y), "click", {
      x,
      y,
    });
    if (gate.kind === "refused") return gate.refusal;
    await this.page.clickAt(x, y);
    return this.settle("page.clicked", gate, { x, y });
  }

  async type(text: string): Promise<ActionResult<null>> {
    this.state.assertUserMayAct("type");
    const target = await this.page.describeFocused();
    const gate = this.judge(target, "type", { chars: text.length });
    if (gate.kind === "refused") return gate.refusal;
    if (target === null || !isTextEntry(target)) {
      return this.blocked(noTextTarget(), "type", { chars: text.length });
    }
    await this.page.typeText(text);
    // Length only, on an ordinary field. On a protected one, not even that.
    return this.settle("page.typed", gate, { chars: text.length });
  }

  async key(name: RelayKey): Promise<ActionResult<null>> {
    this.state.assertUserMayAct("key");
    const detail = { key: name };
    const gate = this.judge(await this.page.describeFocused(), "key", detail);
    if (gate.kind === "refused") return gate.refusal;
    await this.page.pressKey(name);
    return this.settle("page.keyed", gate, detail);
  }

  /** Scrolling has no target and reveals nothing; it is a way of looking. */
  async scroll(dy: number): Promise<ActionResult<null>> {
    this.state.assertUserMayAct("scroll");
    await this.page.scrollBy(dy);
    return this.done("page.scrolled", { dy });
  }

  private judge(
    target: ElementDescriptor | null,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Gate {
    const gate = this.gate.judge(target, action);
    if (gate.kind === "refused") {
      this.record("action.blocked", {
        ...detail,
        action,
        rule: gate.refusal.rule,
        human: gate.refusal.human,
      });
    }
    return gate;
  }

  private settle(
    kind: JournalEventKind,
    gate: Gate,
    detail: Readonly<Record<string, unknown>>,
  ): ActionResult<null> {
    return gate.kind === "protected"
      ? this.done(kind, PROTECTED_DETAIL)
      : this.done(kind, detail);
  }

  private blocked(
    refusal: Refusal,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Refusal {
    this.record("action.blocked", {
      ...detail,
      action,
      rule: refusal.rule,
      human: refusal.human,
    });
    return refusal;
  }

  private done(
    kind: JournalEventKind,
    detail: Readonly<Record<string, unknown>>,
  ): ActionResult<null> {
    this.record(kind, detail);
    return ok(null);
  }

  private record(
    kind: JournalEventKind,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.journal.append(
      { kind, url: this.page.url(), detail: { ...detail, relayed: true } },
      this.state.current(),
      "user",
    );
  }
}
