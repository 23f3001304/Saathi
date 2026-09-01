import type {
  CartMandate,
  IntentMandate,
  MandateKind,
  MandateVerifier,
  PaymentMandate,
  ReasonCode,
} from "@covenant/domain";
import {
  EXECUTOR_AUDIENCE,
  GATEWAY_AUDIENCE,
  GATEWAY_ISSUER,
  PINNED_CONTEXT_URIS,
} from "@covenant/domain";

import type { ChainVerification, VerifiedChain } from "./chain-result.js";
import {
  cartMandateOf,
  intentMandateOf,
  paymentMandateOf,
  rejected,
  rejectedFrom,
  verified,
} from "./chain-result.js";
import type { MandateChainBinder } from "./mandate-chain-binder.js";
import { readCartSubject } from "./vc/cart-subject.js";
import type { ParsedCredential } from "./vc/credential-reader.js";
import { CredentialReader } from "./vc/credential-reader.js";
import { readIntentSubject } from "./vc/intent-subject.js";
import type { MerchantAuthorization } from "./vc/merchant-authorization.js";
import { readPaymentSubject } from "./vc/payment-subject.js";
import { checkPinnedUris } from "./vc/uri-pin.js";

/** Role binding by mandate kind (§6.7 rule 2) — the one place it is decided. */
const ROLE_OF = {
  intent: "user",
  cart: "merchant",
  payment: "gateway",
} as const;

export interface ChainRequest {
  readonly intentJwt: string;
  readonly cartJwt: string;
}

/**
 * Verifies a presented cart JWT plus its referenced intent (§2.3). Signature,
 * role binding and lifetime come from `MandateVerifier`; this facade adds the
 * URI pin, the credential-subject structure and the hash links, and turns every
 * failure into a typed rejection instead of an exception.
 */
export class MandateChainVerifier {
  private readonly reader = new CredentialReader();

  constructor(
    private readonly verifier: MandateVerifier,
    private readonly binder: MandateChainBinder,
    private readonly merchantAuthorization: MerchantAuthorization,
    private readonly pinnedContexts: readonly string[] = PINNED_CONTEXT_URIS,
  ) {}

  async verifyIntent(jwt: string): Promise<ChainVerification<IntentMandate>> {
    try {
      const parsed = await this.parse(jwt, "intent");
      const downgrade = this.uriPin<IntentMandate>(parsed);
      return (
        downgrade ??
        verified(
          intentMandateOf(parsed.envelope, readIntentSubject(parsed.subject)),
        )
      );
    } catch (cause) {
      return rejectedFrom(cause);
    }
  }

  async verifyCart(jwt: string): Promise<ChainVerification<CartMandate>> {
    try {
      const parsed = await this.parse(jwt, "cart");
      const downgrade = this.uriPin<CartMandate>(parsed);
      if (downgrade !== null) {
        return downgrade;
      }
      const subject = readCartSubject(parsed.subject);
      const broken = this.binder.cartHashBinding(subject);
      if (broken !== null) {
        return rejected(broken);
      }
      await this.checkMerchantAuthorization(parsed, subject);
      return verified(cartMandateOf(parsed.envelope, subject));
    } catch (cause) {
      return rejectedFrom(cause);
    }
  }

  /** The intent→cart link, checked after both credentials verify on their own. */
  async verifyChain(
    request: ChainRequest,
  ): Promise<ChainVerification<VerifiedChain>> {
    const intent = await this.verifyIntent(request.intentJwt);
    if (intent.status === "rejected") {
      return intent;
    }
    const cart = await this.verifyCart(request.cartJwt);
    if (cart.status === "rejected") {
      return cart;
    }
    const broken = this.linkFailure(intent.value, cart.value);
    return broken === null
      ? verified({ intent: intent.value, cart: cart.value })
      : rejected(broken);
  }

  async verifyPayment(jwt: string): Promise<ChainVerification<PaymentMandate>> {
    try {
      const parsed = await this.parse(jwt, "payment");
      const downgrade = this.uriPin<PaymentMandate>(parsed);
      return (
        downgrade ??
        verified(
          paymentMandateOf(parsed.envelope, readPaymentSubject(parsed.subject)),
        )
      );
    } catch (cause) {
      return rejectedFrom(cause);
    }
  }

  private linkFailure(
    intent: IntentMandate,
    cart: CartMandate,
  ): ReasonCode | null {
    return (
      this.binder.tenantBinding(intent, cart) ??
      this.binder.cartToIntent(cart, intent)
    );
  }

  private async parse(
    jwt: string,
    kind: MandateKind,
  ): Promise<ParsedCredential> {
    const isPayment = kind === "payment";
    const verifiedJwt = await this.verifier.verify(jwt, {
      role: ROLE_OF[kind],
      audience: isPayment ? EXECUTOR_AUDIENCE : GATEWAY_AUDIENCE,
      issuer: isPayment ? GATEWAY_ISSUER : null,
    });
    return this.reader.read(verifiedJwt, kind);
  }

  private uriPin<T>(parsed: ParsedCredential): ChainVerification<T> | null {
    const failure = checkPinnedUris(
      parsed.envelope.ap2_extension_uri,
      parsed.contexts,
      this.pinnedContexts,
    );
    return failure === null
      ? null
      : rejected<T>(failure.reasonCode, failure.toPass);
  }

  private async checkMerchantAuthorization(
    parsed: ParsedCredential,
    subject: ReturnType<typeof readCartSubject>,
  ): Promise<void> {
    await this.merchantAuthorization.verify(subject.merchant_authorization, {
      merchantIss: parsed.envelope.iss,
      cartId: subject.id,
      cartHash: subject.cart_hash,
    });
  }
}
