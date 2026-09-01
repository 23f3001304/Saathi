import type { Clock, ReasonCode } from "@covenant/domain";
import { isIsoTimestamp, sha256Of } from "@covenant/domain";

import type { BodySignatureVerifier, SignatureBase } from "./body-signature.js";
import { parseSignatureHeader } from "./body-signature.js";

/** ±300 s of gateway time (§4.2). */
export const TIMESTAMP_SKEW_SECONDS = 300;

export interface AcpHeaders {
  readonly idempotencyKey: string | null;
  readonly requestId: string | null;
  readonly signature: string | null;
  readonly timestamp: string | null;
  readonly apiVersion: string | null;
}

export interface AdmissionRequest {
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly parsedBody: unknown;
  readonly issuer: string;
  readonly headers: AcpHeaders;
}

export type Admission =
  | {
      readonly status: "admitted";
      readonly requestId: string;
      readonly idempotencyKey: string;
      readonly payloadHash: string;
    }
  | { readonly status: "rejected"; readonly reasonCode: ReasonCode };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Stage 0, and **not a check** — it stamps no seal (§8.1). Five ACP headers, an
 * exact `API-Version`, a ±300 s timestamp and an ES256 body signature from the
 * pinned trust ring. Everything here fails with an error envelope, because the
 * request could not be *evaluated*; a request that fails policy is a 200.
 */
export class AdmissionGate {
  constructor(
    private readonly signatures: BodySignatureVerifier,
    private readonly clock: Clock,
    private readonly apiVersion: string,
  ) {}

  admit(request: AdmissionRequest): Admission {
    const headers = request.headers;
    const missing = this.headerFailure(headers);
    if (missing !== null) {
      return { status: "rejected", reasonCode: missing };
    }
    const signed = this.signatureOk(request);
    if (!signed) {
      return { status: "rejected", reasonCode: "SIGNATURE_INVALID" };
    }
    return {
      status: "admitted",
      requestId: headers.requestId ?? "",
      idempotencyKey: headers.idempotencyKey ?? "",
      // Canonical, so key ordering or whitespace cannot manufacture a conflict.
      payloadHash: sha256Of(request.parsedBody),
    };
  }

  private headerFailure(headers: AcpHeaders): ReasonCode | null {
    if (headers.requestId === null || !UUID_PATTERN.test(headers.requestId)) {
      return "REQUEST_ID_MISSING";
    }
    if (
      headers.idempotencyKey === null ||
      !UUID_PATTERN.test(headers.idempotencyKey)
    ) {
      return "IDEMPOTENCY_KEY_MISSING";
    }
    // Exact match, fail closed: `API-Version` pins the semantic version.
    if (headers.apiVersion !== this.apiVersion) {
      return "API_VERSION_UNSUPPORTED";
    }
    return this.timestampFailure(headers.timestamp);
  }

  private timestampFailure(timestamp: string | null): ReasonCode | null {
    if (timestamp === null || !isIsoTimestamp(timestamp)) {
      return "TIMESTAMP_SKEW";
    }
    const skew = Math.abs(Date.parse(timestamp) - this.clock.now().getTime());
    return skew <= TIMESTAMP_SKEW_SECONDS * 1000 ? null : "TIMESTAMP_SKEW";
  }

  private signatureOk(request: AdmissionRequest): boolean {
    const header =
      request.headers.signature === null
        ? null
        : parseSignatureHeader(request.headers.signature);
    return (
      header !== null &&
      this.signatures.verify(request.issuer, header, baseOf(request))
    );
  }
}

function baseOf(request: AdmissionRequest): SignatureBase {
  return {
    method: request.method,
    path: request.path,
    timestamp: request.headers.timestamp ?? "",
    idempotencyKey: request.headers.idempotencyKey ?? "",
    rawBody: request.rawBody,
  };
}
