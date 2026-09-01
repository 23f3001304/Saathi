import { describe, expect, it } from "vitest";
import {
  AP2_EXTENSION_URI,
  MEMORY_DIGEST_ALG,
  assertUnreachableMandate,
  cartTotalOf,
  matchMandate,
  merchantIdOf,
  roleOfKid,
  type Mandate,
  type MandateKind,
  type MandateVisitor,
} from "../src/index.js";
import { cart, intent, payment } from "./fixtures.js";

const kindVisitor: MandateVisitor<MandateKind> = {
  intent: (mandate) => mandate.kind,
  cart: (mandate) => mandate.kind,
  payment: (mandate) => mandate.kind,
};

const union: readonly (readonly [MandateKind, Mandate])[] = [
  ["intent", intent],
  ["cart", cart],
  ["payment", payment],
];

const roleTable: readonly (readonly [MandateKind, Mandate, string])[] = [
  ["intent", intent, "user"],
  ["cart", cart, "merchant"],
  ["payment", payment, "gateway"],
];

describe("Mandate union exhaustiveness", () => {
  it.each(union)("routes a %s mandate through the visitor", (kind, mandate) => {
    expect(matchMandate(mandate, kindVisitor)).toBe(kind);
  });

  it("handles every declared kind exactly once", () => {
    const routed = union.map(([, mandate]) =>
      matchMandate(mandate, kindVisitor),
    );
    expect(new Set(routed).size).toBe(union.length);
  });

  it("throws when an unknown kind reaches the switch", () => {
    const rogue = { kind: "refund" } as unknown as Mandate;
    expect(() => matchMandate(rogue, kindVisitor)).toThrow(TypeError);
  });

  it("rejects an unreachable value at runtime as well as at compile time", () => {
    expect(() => assertUnreachableMandate(undefined as never)).toThrow(
      TypeError,
    );
  });
});

describe("role binding", () => {
  it.each(roleTable)(
    "signs a %s mandate with the %s key",
    (_kind, mandate, role) => {
      expect(mandate.role).toBe(role);
      expect(roleOfKid(mandate.kid)).toBe(role);
    },
  );
});

describe("chain binding", () => {
  it("pins the extension URI on every mandate", () => {
    for (const [, mandate] of union) {
      expect(mandate.ap2_extension_uri).toBe(AP2_EXTENSION_URI);
    }
  });

  it("links the cart to its intent by jti and jwt hash", () => {
    expect(cart.intent_mandate_jti).toBe(intent.jti);
    expect(cart.intent_mandate_hash).toBe(`sha256:${intent.jwtHash}`);
  });

  it("links the payment mandate to the cart and carries the digest forward", () => {
    expect(payment.cart_mandate_jti).toBe(cart.jti);
    expect(payment.cart_mandate_hash).toBe(`sha256:${cart.jwtHash}`);
    expect(payment.memory_digest).toBe(cart.memory_digest);
  });

  it("takes the merchant from the cart issuer, with no second place to look", () => {
    expect(merchantIdOf(cart)).toBe(cart.iss);
  });
});

describe("cart provenance fields", () => {
  it("names the digest algorithm it signed over", () => {
    expect(cart.memory_digest_alg).toBe(MEMORY_DIGEST_ALG);
  });

  it("signs the entry ids and the tier floor alongside the digest", () => {
    expect(cart.memory_entry_ids.length).toBeGreaterThan(0);
    expect(cart.memory_tier_floor).toBe("P1");
  });

  it("prices the cart from the payment request it signed", () => {
    expect(cartTotalOf(cart.payment_request).paise).toBe(
      cart.quote.quote_total_paise,
    );
  });

  it("omits user_authorization only where HNP allows it", () => {
    expect(payment.user_authorization).not.toBeNull();
    const hnp = { ...payment, user_authorization: null };
    expect(hnp.user_authorization).toBeNull();
  });
});
