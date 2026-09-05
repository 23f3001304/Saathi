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

/** What this sign-in has done so far: whether a username went in, how many
 *  times a password has been sent, and what the form looked like when the
 *  last one went - which is how a page that has not moved yet is told from a
 *  shop asking a second time. */
export interface FormProgress {
  readonly named: boolean;
  readonly sent: number;
  readonly sentShape: string | null;
}
