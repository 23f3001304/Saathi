/**
 * Injected configuration for the Razorpay adapter. Read from env once, at the
 * composition root (apps/gateway-svc), never inside this package — §2.5 and
 * the task spec both require construction-time injection, not `process.env`
 * reads buried in methods.
 */
export interface RazorpayConfig {
  readonly keyId: string;
  readonly keySecret: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Razorpay Route sub-merchant passthrough (`X-Razorpay-Account`); `null` when absent. */
  readonly linkedAccountId: string | null;
}

/**
 * Verified live: `curl -X POST https://api.razorpay.com/v1/orders` (no auth)
 * returns 401, not a DNS/404 failure, and Razorpay's own docs describe test
 * vs. live mode as selected entirely by which key pair is used (`rzp_test_…`
 * vs `rzp_live_…`) — there is no separate "test-mode" host. One base URL.
 */
export const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

export const DEFAULT_TIMEOUT_MS = 10_000;
