import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Money, type OrderRequest } from "@covenant/domain";
import { DEFAULT_TIMEOUT_MS, RAZORPAY_BASE_URL, type RazorpayConfig } from "../src/config.js";
import { RazorpayClient } from "../src/razorpay-client.js";
import { RazorpayErrorMapper } from "../src/razorpay-error-mapper.js";
import { RazorpayItemCatalog } from "../src/razorpay-item-catalog.js";
import { RazorpayPaymentRail } from "../src/razorpay-payment-rail.js";
import { DEFAULT_RETRY_CONFIG, RetryPolicy } from "../src/retry-policy.js";
import { FakeClock, RecordingLogger, RecordingTracer } from "./fixtures.js";

/**
 * Reads `covenant/.env` (git-ignored, never committed) without a dotenv
 * dependency: KEY=VALUE lines, `#` comments and blanks skipped. Test-only —
 * production config loading belongs to the composition root, not this
 * package (see `config.ts`'s header comment).
 */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (trimmed.length === 0 || trimmed.startsWith("#") || eq === -1) {
      continue;
    }
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envFromFile = readEnvFile(join(repoRoot, ".env"));
const keyId = process.env["RAZORPAY_KEY_ID"] ?? envFromFile["RAZORPAY_KEY_ID"];
const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? envFromFile["RAZORPAY_KEY_SECRET"];
const hasLiveKeys =
  typeof keyId === "string" && keyId.length > 0 && typeof keySecret === "string" && keySecret.length > 0;

function buildLiveRail(config: RazorpayConfig): RazorpayPaymentRail {
  const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const client = new RazorpayClient(
    config,
    fetch,
    new RetryPolicy(
      new FakeClock(Date.now(), 1),
      realSleep,
      DEFAULT_RETRY_CONFIG,
    ),
    new FakeClock(Date.now(), 1),
    new RecordingLogger(),
    new RecordingTracer(),
    new RazorpayErrorMapper(),
  );
  return new RazorpayPaymentRail(client);
}

function buildLiveItems(config: RazorpayConfig): RazorpayItemCatalog {
  const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  return new RazorpayItemCatalog(
    new RazorpayClient(
      config,
      fetch,
      new RetryPolicy(new FakeClock(Date.now(), 1), realSleep, DEFAULT_RETRY_CONFIG),
      new FakeClock(Date.now(), 1),
      new RecordingLogger(),
      new RecordingTracer(),
      new RazorpayErrorMapper(),
    ),
  );
}

const liveConfig = (): RazorpayConfig => ({
  keyId: keyId as string,
  keySecret: keySecret as string,
  baseUrl: RAZORPAY_BASE_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  linkedAccountId: null,
});

// This suite touches Razorpay's real test-mode API and only runs when
// `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are present (env or `covenant/.env`
// — checked, never assumed). Never log `keyId`/`keySecret` anywhere below:
// a `DomainError` carries no secret material, so letting real failures
// propagate to the test reporter is safe.
describe.skipIf(!hasLiveKeys)("live Razorpay test-mode createOrder", () => {
  it(
    "creates a real ₹1.00 test-mode order and returns the documented shape",
    async () => {
      const rail = buildLiveRail({
        keyId: keyId as string,
        keySecret: keySecret as string,
        baseUrl: RAZORPAY_BASE_URL,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        linkedAccountId: null,
      });
      const request: OrderRequest = {
        amount: Money.fromPaise(100, "INR"),
        receipt: `covenant-live-test-${Date.now()}`,
        notes: { agent_present: "true", mandate_id: "covenant-live-integration-test" },
      };

      const order = await rail.createOrder(request);

      expect(order.orderId).toMatch(/^order_/);
      expect(order.receipt).toBe(request.receipt);
      expect(order.amount.equals(Money.fromPaise(100, "INR"))).toBe(true);
    },
    20_000,
  );
});

/**
 * Read-only against the merchant's real item list. It creates nothing: an
 * onboarding run already leaves real items in the account, and a suite that
 * added one per invocation would litter someone's dashboard to prove a call
 * the unit suite already pins against the recorded response.
 */
describe.skipIf(!hasLiveKeys)("live Razorpay test-mode items", () => {
  it("lists the merchant's own items in the documented shape", async () => {
    const items = await buildLiveItems(liveConfig()).listItems(10);

    for (const item of items) {
      expect(item.itemId).toMatch(/^item_/);
      expect(Number.isSafeInteger(item.price.paise)).toBe(true);
      expect(item.price.currency).toMatch(/^[A-Z]{3}$/);
    }
  }, 20_000);
});

if (!hasLiveKeys) {
  it.skip("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not found in env or covenant/.env — live test skipped", () => {});
}
