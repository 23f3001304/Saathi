import type { HandoffReason } from "../session-state.js";

export interface ReadinessSignal {
  readonly name: string;
  readonly met: boolean;
  readonly detail: string;
}

export interface Readiness {
  /** A *suggestion*. Nothing in this package resumes on it. */
  readonly ready: boolean;
  readonly polls: number;
  readonly url: string;
  readonly signals: readonly ReadinessSignal[];
  readonly human: string;
}

/**
 * The only reasons that leave a machine-detectable trace when the user is done.
 * Payment, captcha and final review deliberately do not: there is no signal for
 * "the human decided", and inventing one would be the auto-resume this design
 * exists to refuse.
 */
export const SIGNALLING_REASONS: readonly HandoffReason[] = [
  "login",
  "account-creation",
  "otp",
];

export const DEFAULT_ACCOUNT_MARKERS: readonly string[] = [
  "a[href*='logout']",
  "a[href*='log-out']",
  "a[href*='signout']",
  "a[href*='sign-out']",
  "[data-account]",
  "[data-testid='account-menu']",
];

export function readinessHuman(reason: HandoffReason, ready: boolean): string {
  if (!SIGNALLING_REASONS.includes(reason)) {
    return `There is no reliable signal for "${reason}". Tell the agent to resume when you are done — it will not decide that for you.`;
  }
  return ready
    ? "It looks like you are through. The agent stays paused until you tell it to resume."
    : "Still waiting for you. The agent has taken no action on the page.";
}
