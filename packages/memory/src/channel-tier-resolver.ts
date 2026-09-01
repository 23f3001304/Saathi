import type {
  MandateRole,
  MandateVerifier,
  ReasonCode,
  SourceChannel,
  Tier,
} from "@covenant/domain";
import {
  CHANNEL_QUARANTINED,
  CHANNEL_REQUIRES_SIGNATURE,
  CHANNEL_TIER,
} from "@covenant/domain";

import type {
  GrantedProvenance,
  MemoryWriteCandidate,
} from "./write-candidate.js";

export type ChannelResolution =
  | { readonly ok: true; readonly granted: GrantedProvenance }
  | { readonly ok: false; readonly reasonCode: ReasonCode };

type SignatureCheck =
  | { readonly ok: true; readonly signerRef: string | null }
  | { readonly ok: false; readonly reasonCode: ReasonCode };

/** Stage 1a of §9.1: the role a channel's signature must carry (§9.2). */
const CHANNEL_ROLE: Partial<Record<SourceChannel, MandateRole>> = {
  user_signed_mandate: "user",
  user_confirmation: "user",
  merchant_attestation: "merchant",
};

/**
 * Derives the tier from the **verified source channel**, never from content
 * (§9.2). A lower claim is honoured — an agent may voluntarily downgrade — and
 * a higher one is `TIER_CLAIM_EXCEEDS_CHANNEL`, which is gate one of the three
 * that stop T-1 (§7.2).
 *
 * DECISION: §2.2's `KeyResolver` collaborator is dropped. Why: `MandateVerifier`
 * already resolves `(iss, kid)` against the pinned ring inside
 * `packages/mandates` (§2.3), and a second resolver here would be a second,
 * independently-drifting trust decision about the same signature.
 */
export class ChannelTierResolver {
  constructor(
    private readonly verifier: MandateVerifier,
    private readonly audience: string,
  ) {}

  async resolve(candidate: MemoryWriteCandidate): Promise<ChannelResolution> {
    const signature = await this.verifySignature(candidate);
    if (!signature.ok) {
      return { ok: false, reasonCode: signature.reasonCode };
    }
    const channelTier = CHANNEL_TIER[candidate.sourceChannel];
    if (candidate.tierClaim !== null && candidate.tierClaim > channelTier) {
      return { ok: false, reasonCode: "TIER_CLAIM_EXCEEDS_CHANNEL" };
    }
    return {
      ok: true,
      granted: {
        tier: honoured(candidate.tierClaim, channelTier),
        quarantined: CHANNEL_QUARANTINED[candidate.sourceChannel],
        signerRef: signature.signerRef,
      },
    };
  }

  private async verifySignature(
    candidate: MemoryWriteCandidate,
  ): Promise<SignatureCheck> {
    if (!CHANNEL_REQUIRES_SIGNATURE[candidate.sourceChannel]) {
      return { ok: true, signerRef: null };
    }
    const role = CHANNEL_ROLE[candidate.sourceChannel];
    if (candidate.sig === null || role === undefined) {
      return { ok: false, reasonCode: "SIGNATURE_INVALID" };
    }
    return await this.verifyAs(candidate.sig, role);
  }

  private async verifyAs(
    sig: string,
    role: MandateRole,
  ): Promise<SignatureCheck> {
    try {
      const verified = await this.verifier.verify(sig, {
        role,
        audience: this.audience,
        issuer: null,
      });
      const jti = verified.claims["jti"];
      return { ok: true, signerRef: typeof jti === "string" ? jti : null };
    } catch {
      // Fail closed: an unpinned kid is `SIGNER_UNKNOWN` at the verifier, and
      // every other failure is an invalid signature — neither grants a tier.
      return { ok: false, reasonCode: "SIGNATURE_INVALID" };
    }
  }
}

function honoured(claim: Tier | null, channelTier: Tier): Tier {
  return claim !== null && claim < channelTier ? claim : channelTier;
}
