/**
 * What the card says when control moves. One sentence per reason, kept beside
 * the service rather than in the UI so the two surfaces cannot drift into
 * telling the user different stories about the same pause.
 */
const ASKS: Readonly<Record<string, string>> = {
  login:
    "This shop wants a password. I never type credentials — the window is yours. Sign in and tell me to carry on.",
  "account-creation":
    "This is an account sign-up. Creating an account in your name is not mine to do — the window is yours.",
  otp: "A one-time code was sent to you, so only you can enter it.",
  payment:
    "This is the payment step. Every button and every field here is yours to press.",
  captcha: "That is a bot check. Solving it is yours to do, by design.",
  "final-review":
    "The bag is ready. Look it over in the window; nothing is paid until you say so.",
};

export function askFor(reason: string): string {
  return ASKS[reason] ?? "The window is yours.";
}
