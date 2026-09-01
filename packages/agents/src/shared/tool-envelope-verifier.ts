import type { Clock, MandateRole, MandateVerifier } from "@covenant/domain";

import type { ToolCall, ToolEnvelopeClaims } from "./tool-envelope.js";
import {
  argsHashOf,
  readEnvelopeClaims,
  TOOL_ENVELOPE_AUDIENCE,
  TOOL_ENVELOPE_TTL_SECONDS,
} from "./tool-envelope.js";

export const ENVELOPE_FAILURES = [
  "signature_invalid",
  "malformed",
  "tool_mismatch",
  "server_mismatch",
  "args_tampered",
  "expired",
] as const;

export type EnvelopeFailure = (typeof ENVELOPE_FAILURES)[number];

export type EnvelopeVerification =
  | { readonly ok: true; readonly claims: ToolEnvelopeClaims }
  | { readonly ok: false; readonly failure: EnvelopeFailure };

export interface ToolEnvelopeVerifierConfig {
  /** The server this verifier speaks for — a tool is pinned to it (AM2). */
  readonly server: string;
  readonly callerRole: MandateRole;
  /** `null` = any pinned issuer holding `callerRole`. */
  readonly issuer: string | null;
  readonly ttlSeconds: number;
}

export function envelopeVerifierConfig(
  server: string,
  callerRole: MandateRole,
): ToolEnvelopeVerifierConfig {
  return {
    server,
    callerRole,
    issuer: null,
    ttlSeconds: TOOL_ENVELOPE_TTL_SECONDS,
  };
}

/**
 * AM2 — verifies an inbound envelope and pins the tool to its declared server.
 * Every check is against the *call the server is about to run*, never against
 * the envelope's own copy of it: an envelope that agrees only with itself
 * proves nothing.
 */
export class ToolEnvelopeVerifier {
  constructor(
    private readonly verifier: MandateVerifier,
    private readonly clock: Clock,
    private readonly config: ToolEnvelopeVerifierConfig,
  ) {}

  async verify(jws: string, call: ToolCall): Promise<EnvelopeVerification> {
    const claims = await this.readClaims(jws);
    if (claims === null) {
      return { ok: false, failure: "signature_invalid" };
    }
    const failure = this.checkBinding(claims, call);
    return failure === null ? { ok: true, claims } : { ok: false, failure };
  }

  private async readClaims(jws: string): Promise<ToolEnvelopeClaims | null> {
    try {
      const verified = await this.verifier.verify(jws, {
        role: this.config.callerRole,
        audience: TOOL_ENVELOPE_AUDIENCE,
        issuer: this.config.issuer,
      });
      return readEnvelopeClaims(verified.claims);
    } catch {
      return null;
    }
  }

  private checkBinding(
    claims: ToolEnvelopeClaims,
    call: ToolCall,
  ): EnvelopeFailure | null {
    if (claims.tool !== call.tool) {
      return "tool_mismatch";
    }
    if (claims.server !== call.server || call.server !== this.config.server) {
      return "server_mismatch";
    }
    if (claims.args_hash !== argsHashOf(call.args)) {
      return "args_tampered";
    }
    return this.fresh(claims) ? null : "expired";
  }

  private fresh(claims: ToolEnvelopeClaims): boolean {
    const age = this.clock.now().getTime() - Date.parse(claims.ts);
    return age >= 0 && age <= this.config.ttlSeconds * 1000;
  }
}
