// Demo-mode payment outcomes. A demo that only ever succeeds proves nothing:
// the interesting claims of this system are what happens when a payment
// fails, stalls, or is refused, so the demo rail can be told to produce each
// of those deterministically.
import type { PaymentState } from "@covenant/domain";

export const DEMO_SCENARIOS = [
  "captured",
  "declined",
  "slow-capture",
  "stalled",
  "network-error",
] as const;

export type DemoScenario = (typeof DEMO_SCENARIOS)[number];

export interface ScenarioScript {
  /** What the buyer is meant to learn from watching this one. */
  readonly narrative: string;
  /** Poll results in order; the last state repeats once reached. */
  readonly states: readonly PaymentState[];
  readonly errorCode: string | null;
  /** Simulated latency per poll, so a stall looks like a stall. */
  readonly pollDelayMs: number;
  /** When set, createOrder itself throws — the rail being unreachable. */
  readonly failsAtOrder?: boolean;
}

export const SCENARIO_SCRIPTS: Record<DemoScenario, ScenarioScript> = {
  captured: {
    narrative: "The happy path: authorized, then captured.",
    states: ["created", "authorized", "captured"],
    errorCode: null,
    pollDelayMs: 200,
  },
  declined: {
    narrative:
      "The bank declines. Nothing is charged and the covenant is untouched; the agent must not retry silently.",
    states: ["created", "failed"],
    errorCode: "BAD_REQUEST_ERROR",
    pollDelayMs: 200,
  },
  "slow-capture": {
    narrative:
      "Authorization lands quickly, capture lags. The idempotency key is what keeps a retry from double-charging.",
    states: ["created", "authorized", "authorized", "authorized", "captured"],
    errorCode: null,
    pollDelayMs: 600,
  },
  stalled: {
    narrative:
      "The payment never resolves. The transaction parks as pending rather than guessing, and nothing is re-signed.",
    states: ["created", "authorized"],
    errorCode: null,
    pollDelayMs: 600,
  },
  "network-error": {
    narrative:
      "The rail is unreachable. The gateway retries on the same receipt and then refuses, rather than creating a second order.",
    states: ["created"],
    errorCode: "SERVER_ERROR",
    pollDelayMs: 200,
    failsAtOrder: true,
  },
};

/**
 * Razorpay test mode, for a judge driving a real test-mode payment page.
 * Verified against razorpay.com/docs/payments/payments/test-card-details:
 * any future expiry, any CVV, and the OTP rule below. Card numbers are
 * deliberately not hardcoded here — they change, and the docs are the
 * source of truth we send people to.
 */
export const TEST_MODE_GUIDE = {
  docsUrl: "https://razorpay.com/docs/payments/payments/test-card-details/",
  expiry: "Any future date",
  cvv: "Any random CVV",
  otpSucceeds: "Any OTP of 4 to 10 digits",
  otpFails: "Any OTP shorter than 4 digits",
  tokenValidity: "Test-mode card tokens are valid for 3 days",
} as const;
