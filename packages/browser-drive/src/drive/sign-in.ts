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
    if (name !== null) {
      await this.page.typeInto(name.descriptor.selector, creds.username);
    }
    await this.page.typeInto(secret.descriptor.selector, creds.password);
    this.protectedLine({ sign_in: true, named: name !== null });
    await this.page.pressKey("Enter");
    return { state: "signed", named: name !== null };
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

function passwordField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find(
      (field) =>
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
      if (!isTextEntry(held) || held.inputType === "password") return false;
      const category = classifier.classify(held).category;
      return category === null || category === "login_context";
    }) ?? null
  );
}

