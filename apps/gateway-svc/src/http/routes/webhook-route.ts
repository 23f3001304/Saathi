import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppEnv } from "../app-env.js";

/**
 * `POST /webhooks/razorpay` (§4.8). No ACP headers: Razorpay signs with its
 * own HMAC over the **raw body bytes**, which are read before any JSON parse —
 * re-serialising a parsed body would change whitespace and key order, and the
 * signature would either never match or match a body different from the one
 * that was signed.
 *
 * The reply is always 200 within Razorpay's 5 s window, applied or not: a
 * non-2xx makes Razorpay retry, and a forged webhook that provoked retries
 * would be an amplifier we built ourselves. A bad signature changes no state
 * and is ledgered as `webhook.rejected`.
 */
export function registerWebhook(app: Hono<AppEnv>, root: CompositionRoot): void {
  app.post("/v1/webhooks/razorpay", async (context) => {
    const rawBytes = new Uint8Array(await context.req.arrayBuffer());
    const rawBody = new TextDecoder().decode(rawBytes);
    const body = root.services.webhooks.receive({
      rawBody,
      rawBytes,
      signature: context.req.header("X-Razorpay-Signature") ?? null,
      tenantId: context.get("tenantId"),
    });
    return context.json(body, 200);
  });
}
