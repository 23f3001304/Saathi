import type { FieldClassifier } from "../field/field-classifier.js";
import {
  codeField,
  passwordField,
  usernameField,
} from "./sign-in-fields.js";
import type { Journal } from "../journal.js";
import type { DrivenPage, FieldSnapshot, Waiter } from "../ports.js";
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
/** How many times the page is read before this gives up, and how long a
 *  submitted step is given to become the next one. Amazon's takes a
 *  navigation; a slow one still lands inside this, and a form that never
 *  produces a password box is answered rather than waited on forever. */
const STEP_TRIES = 12;
const STEP_MS = 500;

export class SignInDrive {
  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
    private readonly waiter: Waiter = { sleep: () => Promise.resolve() },
  ) {}

  /**
   * DECISION: read the page, then decide - never a script of steps.
   *
   * This required a password box on the page it was called on, and Amazon,
   * the shop it exists for, asks for the email first and shows the password
   * only after Continue. The obvious repair was to hardcode "fill email,
   * submit, wait for password", which would have been this shell knowing what
   * Amazon's form looks like - and wrong the first time a shop asked in a
   * different order, or in three steps, or put both boxes on one page.
   *
   * So each pass looks at what is actually on the page and does the one thing
   * that follows from it: a password box is filled and submitted, a username
   * box that has not been filled yet is filled and submitted, and a page with
   * neither is answered rather than waited on. A one-page form finishes on the
   * first pass, Amazon's on the second, and a form nobody has seen yet on
   * whichever pass its password box appears.
   *
   * The vault's values still cross only through this call, the journal still
   * records `{protected: true}` and not one character, and every box is aimed
   * at and hit-tested before a key is sent.
   */
  async into(creds: SignInCreds): Promise<SignInReport> {
    this.state.assertAgentMayAct("sign_in");
    let named = false;
    for (let pass = 0; pass < STEP_TRIES; pass += 1) {
      const fields = await this.page.snapshotFields();
      const secret = passwordField(fields, this.classifier);
      if (secret !== null) {
        const also = named ? null : usernameField(fields, this.classifier);
        return await this.submit(secret, creds, also, named);
      }
      if (named) {
        // The username is in and sent; this page is on its way to the next.
        await this.waiter.sleep(STEP_MS);
        continue;
      }
      if (!(await this.name(fields, creds))) {
        return { state: "no_password_field", named };
      }
      named = true;
    }
    return { state: "no_password_field", named };
  }

  /** The password half: fill the box that is here, and send the form. A
   *  username box standing beside it is filled first, which is how a one-page
   *  form finishes on the first pass. */
  private async submit(
    secret: FieldSnapshot,
    creds: SignInCreds,
    name: FieldSnapshot | null,
    already = false,
  ): Promise<SignInReport> {
    const named =
      name === null ? already : await this.fill(name, creds.username);
    if (!(await this.fill(secret, creds.password))) {
      // The point the password box occupied is not the password box any more.
      // Nothing has been typed, and nothing is submitted.
      return { state: "no_password_field", named };
    }
    this.protectedLine({ sign_in: true, named });
    await this.page.pressKey("Enter");
    return { state: "signed", named };
  }

  /** The username half of a form that asks in two: filled and sent, so the
   *  next pass sees whatever the shop shows next. */
  private async name(
    fields: readonly FieldSnapshot[],
    creds: SignInCreds,
  ): Promise<boolean> {
    const box = usernameField(fields, this.classifier);
    if (box === null || !(await this.fill(box, creds.username))) return false;
    this.protectedLine({ sign_in: true, named: true, step: "username" });
    await this.page.pressKey("Enter");
    await this.waiter.sleep(STEP_MS);
    return true;
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
    if (codeField(fields, this.classifier) !== null) return "code";
    return passwordField(fields, this.classifier) === null ? null : "password";
  }

  /** One shopper-given code into the one box the classifier calls a code
   *  box, and nowhere else. */
  async enterCode(code: string): Promise<boolean> {
    this.state.assertAgentMayAct("enter_code");
    const fields = await this.page.snapshotFields();
    const box = codeField(fields, this.classifier);
    // Aimed and hit-tested like the password: a code box that is not on the
    // page is not one to type a shopper's code into either.
    if (box === null || !(await this.fill(box, code))) return false;
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
