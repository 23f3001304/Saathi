import type { IdGenerator } from "@covenant/domain";

/** The `ap2_role` claim of an AM2 tool envelope — who is calling, not what. */
export const AP2_AGENT_ROLES = ["buyer", "merchant"] as const;

export type Ap2AgentRole = (typeof AP2_AGENT_ROLES)[number];

/**
 * A.3: one identity per agent process, minted once at construction and bound
 * into every mandate and every tool envelope the process emits. Minting it per
 * call would let two calls inside one session disown each other, which is
 * exactly the correlation the audit trail is built on.
 */
export class AgentInstance {
  readonly instanceId: string;

  constructor(
    readonly ap2Role: Ap2AgentRole,
    /** `urn:covenant:user:<uuid>` or `urn:covenant:merchant:<slug>` (§6.7). */
    readonly principal: string,
    ids: IdGenerator,
  ) {
    this.instanceId = `urn:covenant:agent:${ap2Role}:${ids.uuid()}`;
  }
}
