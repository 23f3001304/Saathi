import type {
  IntentBounds,
  PaymentRequest,
  ReasonCode,
} from "@covenant/domain";
import type { CartMandateIssuer, CartMandateRequest } from "@covenant/mandates";
import type { ReadGate } from "@covenant/memory";
import { describe, expect, it } from "vitest";

import type { CartAssemblyRequest } from "../src/buyer/cart-assembler.js";
import { CartAssembler } from "../src/buyer/cart-assembler.js";
import { intentBounds, paymentRequest, QUOTE_REF } from "./builders.js";
import { FakeClock } from "./fakes.js";

const DIGEST = `sha256:${"c0".repeat(32)}`;

function fakeReadGate(entryIds: readonly string[]): ReadGate {
  return {
    retrieve: async () => ({
      actionClass: "cart-construction",
      entries: entryIds.map((id) => ({ id })),
      digest: DIGEST,
      digestAlg: "covenant-md-1",
      tierFloor: 1,
      eventId: "evt_7",
    }),
  } as unknown as ReadGate;
}

function fakeIssuer(seen: CartMandateRequest[]): CartMandateIssuer {
  return {
    issue: async (request: CartMandateRequest) => {
      seen.push(request);
      return {
        jwt: "a.b.c",
        jti: "urn:uuid:00000000-0000-4000-8000-000000000002",
        jwtHash: "f".repeat(64),
        payload: {},
      };
    },
  } as unknown as CartMandateIssuer;
}

function requestFor(
  bounds: IntentBounds,
  request: PaymentRequest,
  merchantId = "kolam-run",
): CartAssemblyRequest {
  return {
    merchantIss: "urn:covenant:merchant:kolam-run",
    merchantId,
    userSub: "urn:covenant:user:9f3c",
    userId: "user_1",
    tenantId: "tnt_demo",
    cartId: "cart_1",
    intentJti: "urn:uuid:00000000-0000-4000-8000-000000000003",
    intentJwtHash: "a".repeat(64),
    bounds,
    paymentRequest: request,
    quote: QUOTE_REF,
    riskData: null,
    agentInstanceId: "urn:covenant:agent:buyer:1",
    retrievalQuery: "running shoes under 2000 refundable",
    ttlSeconds: 600,
  };
}

interface Row {
  readonly name: string;
  readonly bounds: IntentBounds;
  readonly request: PaymentRequest;
  readonly merchantId: string;
  readonly reasonCode: ReasonCode | null;
}

const ROWS: readonly Row[] = [
  {
    name: "a cart inside every bound",
    bounds: intentBounds(),
    request: paymentRequest(),
    merchantId: "kolam-run",
    reasonCode: null,
  },
  {
    name: "a cart above the signed cap",
    bounds: intentBounds(),
    request: paymentRequest({ value: "2499.00" }),
    merchantId: "kolam-run",
    reasonCode: "CART_EXCEEDS_INTENT_CAP",
  },
  {
    name: "a cart priced in another currency",
    bounds: intentBounds(),
    request: paymentRequest({ currency: "USD", value: "20.00" }),
    merchantId: "kolam-run",
    reasonCode: "CURRENCY_MISMATCH",
  },
  {
    name: "a merchant the intent never named",
    bounds: intentBounds(),
    request: paymentRequest(),
    merchantId: "some-other-shop",
    reasonCode: "MERCHANT_NOT_ALLOWED",
  },
  {
    name: "a SKU outside the allowlist",
    bounds: intentBounds({ skus: ["KR-SOCK-3P"] }),
    request: paymentRequest(),
    merchantId: "kolam-run",
    reasonCode: "SKU_NOT_ALLOWED",
  },
  {
    name: "a non-refundable cart under a refundability constraint",
    bounds: intentBounds(),
    request: paymentRequest({ refundable: false }),
    merchantId: "kolam-run",
    reasonCode: "REFUNDABILITY_REQUIRED",
  },
];

describe("CartAssembler respects the signed intent bounds", () => {
  it.each(ROWS)("$name", async (row) => {
    const seen: CartMandateRequest[] = [];
    const assembler = new CartAssembler(
      fakeReadGate(["mem_1"]),
      fakeIssuer(seen),
      new FakeClock("2026-08-31T09:14:02.113Z"),
    );

    const result = await assembler.assemble(
      requestFor(row.bounds, row.request, row.merchantId),
    );

    expect(result.ok).toBe(row.reasonCode === null);
    expect(!result.ok && result.reasonCode).toBe(row.reasonCode ?? false);
    // A refused cart is refused before anyone is asked to sign it.
    expect(seen).toHaveLength(row.reasonCode === null ? 1 : 0);
  });
});

describe("CartAssembler binds the beliefs that justified the cart", () => {
  it("lists the retrieved entry ids and the digest it will be checked against", async () => {
    const seen: CartMandateRequest[] = [];
    const assembler = new CartAssembler(
      fakeReadGate(["mem_1", "mem_2", "mem_3"]),
      fakeIssuer(seen),
      new FakeClock("2026-08-31T09:14:02.113Z"),
    );

    const result = await assembler.assemble(
      requestFor(intentBounds(), paymentRequest()),
    );

    expect(result.ok && result.cart.memoryEntryIds).toEqual([
      "mem_1",
      "mem_2",
      "mem_3",
    ]);
    expect(result.ok && result.cart.memoryDigest).toBe(DIGEST);
    expect(seen[0]).toMatchObject({
      memoryEntryIds: ["mem_1", "mem_2", "mem_3"],
      memoryDigest: DIGEST,
      memoryTierFloor: "P1",
    });
  });
});
