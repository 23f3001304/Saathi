import { isTextEntry } from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { Journal } from "../journal.js";
import type { DrivenPage, FieldSnapshot } from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";

/** Values straight from the host's vault. No model composes or reads this
 *  object: the tool that triggers a sign-in takes no arguments at all. */
export interface SignInCreds {
  readonly username: string;
  readonly password: string;
}

export type SignInState =
  | "signed"
  | "no_password_field"
  /** A code or a second password page still stands after the submit. */
  | "challenged";

export interface SignInReport {
  readonly state: SignInState;
  /** Whether a username box was found and filled beside the password. */
  readonly named: boolean;
}

/**
 * The host signs in, on the shopper's stored instruction. This is the one
 * deliberate crossing of the "agent never types a credential" line, and it
 * crosses with the property intact: the values come from the vault, arrive
 * through this typed call, and no model can read, choose or observe them.
 * The journal records that it happened - `{protected: true}`, the same single
 * line the human relay writes - and not one character of what was typed.
 *
 * DECISION: submit is the Enter key in the password box, not a hunted button.
 * A login form that does not submit on Enter is rare; a button search that
 * clicks the wrong control on a busy page is not.
 */
export class SignInDrive {
  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
  ) {}

  async into(creds: SignInCreds): Promise<SignInReport> {
    this.state.assertAgentMayAct("sign_in");
    const fields = await this.page.snapshotFields();
    const secret = passwordField(fields, this.classifier);
    if (secret === null) {
      return { state: "no_password_field", named: false };
    }
    const name = usernameField(fields, this.classifier);
    const named = name === null ? false : await this.fill(name, creds.username);
    if (!(await this.fill(secret, creds.password))) {
      // The point the password box occupied is not the password box any more.
      // Nothing has been typed, and nothing is submitted.
      return { state: "no_password_field", named };
    }
    this.protectedLine({ sign_in: true, named });
    await this.page.pressKey("Enter");
    return { state: "signed", named };
  }

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
  private async fill(field: FieldSnapshot, value: string): Promise<boolean> {
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

  /** Whether the settled page still challenges: a code box, or the password
   *  box again. Read after the navigation settles. */
  async challenge(): Promise<"code" | "password" | null> {
    const fields = await this.page.snapshotFields();
    for (const field of fields) {
      if (this.classifier.classify(field.descriptor).category === "otp") {
        return "code";
      }
    }
    return passwordField(fields, this.classifier) === null ? null : "password";
  }

  /** One shopper-given code into the one box the classifier calls a code
   *  box, and nowhere else. */
  async enterCode(code: string): Promise<boolean> {
    this.state.assertAgentMayAct("enter_code");
    const fields = await this.page.snapshotFields();
    const box =
      fields.find(
        (field) =>
          onScreen(field) &&
          this.classifier.classify(field.descriptor).category === "otp",
      ) ?? null;
    if (box === null) return false;
    await this.page.typeInto(box.descriptor.selector, code);
    this.protectedLine({ code_entry: true });
    await this.page.pressKey("Enter");
    return true;
  }

  private protectedLine(detail: Readonly<Record<string, unknown>>): void {
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

/**
 * A box that is actually on the page.
 *
 * DECISION: geometry, not the DOM's word for it. A sign-in page routinely
 * carries a hidden password input the shopper never sees - Amazon's
 * email-first step does - and `page.type` focuses its target and then sends
 * keystrokes: focusing an element with no box silently does nothing, so the
 * keys went to whatever still had focus. Live, that was the email box that had
 * just been filled, and the shopper's password was typed into it in plain
 * sight, appended to their address. A field with no box is not a field this
 * may type into.
 */
function onScreen(field: FieldSnapshot): boolean {
  return field.rect.width > 0 && field.rect.height > 0;
}

function passwordField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find(
      (field) =>
        onScreen(field) &&
        classifier.classify(field.descriptor).category === "password",
    ) ?? null
  );
}

/** The plain text or email entry standing beside the password: not itself
 *  sensitive beyond login context, and not the password box. */
function usernameField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find((field) => {
      const held = field.descriptor;
      if (!onScreen(field)) return false;
      if (!isTextEntry(held) || held.inputType === "password") return false;
      const category = classifier.classify(held).category;
      return category === null || category === "login_context";
    }) ?? null
  );
}

