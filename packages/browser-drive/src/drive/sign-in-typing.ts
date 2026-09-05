import type { Journal } from "../journal.js";
import type { DrivenPage, FieldSnapshot } from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";

/**
 * Putting a secret into a box, and saying so without saying what.
 *
 * The two halves belong together because they are the same promise made twice:
 * the keys go only where the pixels were, and the record of them carries no
 * characters. Both the sign-in form and the shopper's one-time code type
 * through this, so neither can acquire its own weaker version.
 */
export class GuardedTyping {
  constructor(
    private readonly page: DrivenPage,
    private readonly journal: Journal,
    private readonly state: SessionStateMachine,
  ) {}

  /**
   * A click at the box, then keystrokes into that focus - the same two moves
   * `PointActions.type` makes, and for the same reason.
   *
   * DECISION: a point and a hit-test, never a selector handed to
   * `page.type`. That helper focuses its target and then sends keys, so
   * focusing an element with no box does nothing and the keys land on
   * whatever still had focus. On Amazon's email-first sign-in - a hidden
   * password input beside a visible email box - that was the shopper's
   * password, typed in plain sight into the email field, appended to their
   * own address. Aiming at a point cannot do that: the keys go where the
   * click went, and the click went where the pixels are.
   *
   * The hit-test is the same rule the agent's own aim answers to. What is
   * under the point has to be the box this was aimed at, or nothing is typed.
   */
  async fill(field: FieldSnapshot, value: string): Promise<boolean> {
    const x = Math.round(field.rect.x + field.rect.width / 2);
    const y = Math.round(field.rect.y + field.rect.height / 2);
    const under = await this.page.describeAt(x, y);
    if (under === null || under.selector !== field.descriptor.selector) {
      return false;
    }
    await this.page.clickAt(x, y);
    await this.page.typeText(value);
    return true;
  }

  /** That it happened, and nothing about what was typed - the same single
   *  `{protected: true}` line the human relay writes. */
  record(detail: Readonly<Record<string, unknown>>): void {
    this.journal.append(
      {
        kind: "page.typed",
        url: this.page.url(),
        detail: { protected: true, ...detail },
      },
      this.state.current(),
    );
  }
}
