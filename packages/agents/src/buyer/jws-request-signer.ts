import type { MandateRole, MandateSigner } from "@covenant/domain";
import { sha256Hex } from "@covenant/domain";

import type { AcpSignature, RequestSigner } from "./acp-headers.js";

interface ProtectedHeader {
  readonly kid?: unknown;
}

function decodeKid(protectedSegment: string): string {
  const json = Buffer.from(protectedSegment, "base64url").toString("utf8");
  const header = JSON.parse(json) as ProtectedHeader;
  if (typeof header.kid !== "string") {
    throw new TypeError("signed JWS carries no `kid` to present as `keyid`");
  }
  return header.kid;
}

/**
 * DECISION: the ACP `Signature` header is produced by signing a one-claim JWS
 * over `sha256(BASE)` and lifting `kid` + the signature segment out of it.
 * Why: §2.7 gives `GatewayClient` a `MandateSigner`, which signs claim sets;
 * a raw-bytes signing port would have to be added to `domain`, and `domain`
 * is the one package every other package depends on. The signature still
 * commits to the §4.2 base string — through the claim, not around it — and
 * the header still carries the `kid` the pinned trust ring resolves.
 */
export class JwsRequestSigner implements RequestSigner {
  constructor(
    private readonly signer: MandateSigner,
    private readonly role: MandateRole,
  ) {}

  async sign(base: string): Promise<AcpSignature> {
    const jws = await this.signer.sign(
      { sig_base: sha256Hex(base), alg_binding: "acp/base-string@2026-08-31" },
      this.role,
    );
    const segments = jws.split(".");
    const [protectedSegment, , signature] = segments;
    if (segments.length !== 3 || protectedSegment === undefined) {
      throw new TypeError("MandateSigner did not return a compact JWS");
    }
    return { kid: decodeKid(protectedSegment), sig: signature ?? "" };
  }
}
