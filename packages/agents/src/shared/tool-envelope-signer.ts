import type {
  Clock,
  IdGenerator,
  MandateRole,
  MandateSigner,
} from "@covenant/domain";

import type { AgentInstance } from "./agent-instance.js";
import type {
  SignedToolEnvelope,
  ToolCall,
  ToolEnvelopeClaims,
} from "./tool-envelope.js";
import {
  argsHashOf,
  TOOL_ENVELOPE_AUDIENCE,
  TOOL_ENVELOPE_TTL_SECONDS,
} from "./tool-envelope.js";

export interface ToolEnvelopeSignerConfig {
  readonly keyRole: MandateRole;
  readonly ttlSeconds: number;
}

export const DEFAULT_ENVELOPE_SIGNER_CONFIG: ToolEnvelopeSignerConfig = {
  keyRole: "user",
  ttlSeconds: TOOL_ENVELOPE_TTL_SECONDS,
};

/**
 * AM2 — wraps every outbound MCP call in an application-layer signature over
 * `{caller, ap2_role, tool, server, args_hash, ts, nonce}`. The args are
 * hashed, not embedded: an envelope is metadata a middlebox may log, and a
 * cart body is not.
 */
export class ToolEnvelopeSigner {
  constructor(
    private readonly signer: MandateSigner,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly instance: AgentInstance,
    private readonly config: ToolEnvelopeSignerConfig,
  ) {}

  async sign(call: ToolCall): Promise<SignedToolEnvelope> {
    const issuedAt = this.clock.now();
    const claims = this.claimsFor(call, issuedAt);
    const seconds = Math.floor(issuedAt.getTime() / 1000);
    const jws = await this.signer.sign(
      {
        ...claims,
        iss: this.instance.principal,
        // An agent signing for itself: the envelope's subject is its issuer.
        // Es256Verifier requires `sub`, and omitting it fails every envelope
        // against the real pinned ring.
        sub: this.instance.principal,
        aud: TOOL_ENVELOPE_AUDIENCE,
        jti: claims.nonce,
        iat: seconds,
        exp: seconds + this.config.ttlSeconds,
      },
      this.config.keyRole,
    );
    return { jws, claims };
  }

  private claimsFor(call: ToolCall, issuedAt: Date): ToolEnvelopeClaims {
    return {
      caller: this.instance.instanceId,
      ap2_role: this.instance.ap2Role,
      tool: call.tool,
      server: call.server,
      args_hash: argsHashOf(call.args),
      ts: issuedAt.toISOString(),
      nonce: `urn:uuid:${this.ids.uuid()}`,
    };
  }
}
