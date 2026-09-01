import type { Clock, IdGenerator, MandateKind } from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  PINNED_CONTEXT_URIS,
  W3C_CREDENTIALS_CONTEXT,
} from "@covenant/domain";

import type {
  MandateJwtPayload,
  VerifiableCredentialClaim,
} from "./mandate-claims.js";
import {
  CREDENTIAL_TYPE_OF,
  ENVELOPE_SHAPE,
  VERIFIABLE_CREDENTIAL,
  epochSeconds,
  toJti,
} from "./mandate-claims.js";

export interface EnvelopeRequest {
  readonly kind: MandateKind;
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  /** `null` mints a fresh nonce; a caller that already ledgered one passes it. */
  readonly jti: string | null;
  readonly issuedAt: Date | null;
  readonly ttlSeconds: number;
  readonly credentialSubject: Readonly<Record<string, unknown>>;
}

/**
 * JWT-VC serialization: registered claims carry identity and lifetime, the `vc`
 * claim carries the W3C credential (§6). The `@context` written here is the
 * pinned pair and nothing else — there is no code path that emits an
 * unpinned context, so a downgrade has to arrive from outside and gets caught
 * by the URI pin on the way in.
 */
export class CredentialEnvelope {
  constructor(
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  mintJti(): string {
    return toJti(this.idGenerator.uuid());
  }

  issue(request: EnvelopeRequest): MandateJwtPayload {
    const issuedAt = request.issuedAt ?? this.clock.now();
    const iat = epochSeconds(issuedAt);
    const shape = ENVELOPE_SHAPE[request.kind];
    const registered = {
      iss: request.iss,
      sub: request.sub,
      aud: request.aud,
      iat,
      ...(shape.nbf ? { nbf: iat } : {}),
      exp: iat + request.ttlSeconds,
      jti: request.jti ?? this.mintJti(),
    };
    return { ...registered, vc: credentialOf(request, issuedAt) };
  }
}

function credentialOf(
  request: EnvelopeRequest,
  issuedAt: Date,
): VerifiableCredentialClaim {
  const shape = ENVELOPE_SHAPE[request.kind];
  return {
    "@context": [...PINNED_CONTEXT_URIS],
    type: [VERIFIABLE_CREDENTIAL, CREDENTIAL_TYPE_OF[request.kind]],
    issuer: request.iss,
    ...(shape.validFrom ? { validFrom: issuedAt.toISOString() } : {}),
    credentialSubject: {
      ...request.credentialSubject,
      ap2_extension_uri: AP2_EXTENSION_URI,
    },
  };
}

export function pinnedContexts(): readonly string[] {
  return [W3C_CREDENTIALS_CONTEXT, AP2_EXTENSION_URI];
}
