import type { FieldClassifier } from "../field/field-classifier.js";
import type { DrivenPage, FieldSnapshot, Waiter } from "../ports.js";
import {
  formShape,
  passwordField,
  usernameField,
} from "./sign-in-fields.js";
import type {
  FormProgress,
  SignInCreds,
  SignInReport,
} from "./sign-in-report.js";
import type { GuardedTyping } from "./sign-in-typing.js";

/** How many times the page is read before this gives up, and how long a
 *  submitted step is given to become the next one. Amazon's takes a
 *  navigation; a slow one still lands inside this, and a form that never
 *  produces a password box is answered rather than waited on forever. */
const STEP_TRIES = 12;
const STEP_MS = 500;

/**
 * How many times a password may be sent for one sign-in.
 *
 * Two, because a form that asks in two steps legitimately takes two: one for
 * the page that shows both boxes and takes only the email, one for the real
 * password step behind it. A third would mean the shop is refusing the
 * password it has, and typing it again is how an account gets locked. That
 * case is `challenged`, and the window goes to the shopper.
 */
const MAX_PASSWORD_SENDS = 2;

/**
 * Working one shop's sign-in form to the end of what the host can do.
 *
 * DECISION: read the page, then decide - never a script of steps. The first
 * version required a password box on the page it was called on, and Amazon,
 * the shop it exists for, asks for the email first. The obvious repair was to
 * hardcode "fill email, submit, wait for password", which would have been this
 * shell knowing what Amazon's form looks like, and wrong the first time a shop
 * asked in a different order, or in three steps, or put both boxes on one page.
 *
 * So each pass looks at what is actually on the page and does the one thing
 * that follows from it. A one-page form finishes on the first pass, a
 * two-step form on a later one, and a form nobody has seen yet on whichever
 * pass its password box appears.
 */
export class SignInForm {
  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly typing: GuardedTyping,
    private readonly waiter: Waiter,
  ) {}

  async work(creds: SignInCreds): Promise<SignInReport> {
    let form: FormProgress = { named: false, sent: 0, sentShape: null };
    for (let pass = 0; pass < STEP_TRIES; pass += 1) {
      const fields = await this.page.snapshotFields();
      const next = await this.step(fields, creds, form);
      if (next.report !== undefined) return next.report;
      form = next.form;
    }
    return this.ending(form);
  }

  /** One pass: what is on the page decides which half of the form runs. */
  private async step(
    fields: readonly FieldSnapshot[],
    creds: SignInCreds,
    form: FormProgress,
  ): Promise<{ report?: SignInReport; form: FormProgress }> {
    const secret = passwordField(fields, this.classifier);
    if (secret !== null) {
      if (formShape(fields) === form.sentShape) {
        // The form we just submitted, unchanged. It has not moved yet, and a
        // password typed into it again is the same password twice.
        await this.waiter.sleep(STEP_MS);
        return { form };
      }
      if (form.sent >= MAX_PASSWORD_SENDS) {
        return { report: { state: "challenged", named: form.named }, form };
      }
      return await this.send(secret, fields, creds, form);
    }
    // No password box. Either the form is behind us or it has not shown one
    // yet, and which of those it is, is what `sent` says.
    if (form.sent > 0) return { report: this.ending(form), form };
    if (form.named) {
      await this.waiter.sleep(STEP_MS);
      return { form };
    }
    if (!(await this.name(fields, creds))) {
      return { report: { state: "no_password_field", named: false }, form };
    }
    return { form: { ...form, named: true } };
  }

  /**
   * One password submission, then a look at what the page became.
   *
   * DECISION: submitting is never the end of it. Amazon shows an email box and
   * a password box on one page, takes only the email when Continue is pressed,
   * and *then* swaps in the real password step - so a sign-in that reported
   * success at the Enter key reported it over a form still asking, and the
   * shopper was told to read the page and carry on. Every send is followed by
   * another look, which is the only way to tell "we are through" from "that
   * was step one".
   */
  private async send(
    secret: FieldSnapshot,
    fields: readonly FieldSnapshot[],
    creds: SignInCreds,
    form: FormProgress,
  ): Promise<{ report?: SignInReport; form: FormProgress }> {
    const also = form.named ? null : usernameField(fields, this.classifier);
    const shape = formShape(fields);
    const sent = await this.submit(secret, creds, also, form.named);
    if (sent.state !== "signed") return { report: sent, form };
    await this.waiter.sleep(STEP_MS);
    return { form: { named: sent.named, sent: form.sent + 1, sentShape: shape } };
  }

  /** The password half: fill the box that is here, and send the form. A
   *  username box standing beside it is filled first, which is how a one-page
   *  form finishes on the first pass. */
  private async submit(
    secret: FieldSnapshot,
    creds: SignInCreds,
    name: FieldSnapshot | null,
    already: boolean,
  ): Promise<SignInReport> {
    const named =
      name === null ? already : await this.typing.fill(name, creds.username);
    if (!(await this.typing.fill(secret, creds.password))) {
      // The point the password box occupied is not the password box any more.
      // Nothing has been typed, and nothing is submitted.
      return { state: "no_password_field", named };
    }
    this.typing.record({ sign_in: true, named });
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
    if (box === null || !(await this.typing.fill(box, creds.username))) {
      return false;
    }
    this.typing.record({ sign_in: true, named: true, step: "username" });
    await this.page.pressKey("Enter");
    await this.waiter.sleep(STEP_MS);
    return true;
  }

  /** A password went in and the box is gone, so as far as this host can see
   *  the form is behind us. Whether the shop agrees is `challenge()`'s to
   *  answer, off the settled page. */
  private ending(form: FormProgress): SignInReport {
    return form.sent > 0
      ? { state: "signed", named: form.named }
      : { state: "no_password_field", named: form.named };
  }
}
