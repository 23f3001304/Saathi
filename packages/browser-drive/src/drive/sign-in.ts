import type { FieldClassifier } from "../field/field-classifier.js";
import type { Journal } from "../journal.js";
import type { DrivenPage, Waiter } from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";
import { codeField, passwordField } from "./sign-in-fields.js";
import { SignInForm } from "./sign-in-form.js";
import type { SignInCreds, SignInReport } from "./sign-in-report.js";
import { GuardedTyping } from "./sign-in-typing.js";

export type {
  SignInCreds,
  SignInReport,
  SignInState,
} from "./sign-in-report.js";

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
  private readonly typing: GuardedTyping;
  private readonly form: SignInForm;

  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    journal: Journal,
    waiter: Waiter = { sleep: () => Promise.resolve() },
  ) {
    this.typing = new GuardedTyping(page, journal, state);
    this.form = new SignInForm(page, classifier, this.typing, waiter);
  }

  /** The gate, then the form. Nothing here knows what a shop's sign-in looks
   *  like; `SignInForm` reads the page and decides pass by pass. */
  async into(creds: SignInCreds): Promise<SignInReport> {
    this.state.assertAgentMayAct("sign_in");
    return await this.form.work(creds);
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
    if (box === null || !(await this.typing.fill(box, code))) return false;
    this.typing.record({ code_entry: true });
    await this.page.pressKey("Enter");
    return true;
  }
}
