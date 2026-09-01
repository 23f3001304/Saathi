import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

/**
 * The other half of the shopper's memory.
 *
 * A trait is a durable fact about the person — "I wear size L", "I am in
 * Bengaluru", "always refundable". It outlives the conversation it was said in.
 * A stated request ("a navy kurta under 2000") does not, and treating the two
 * alike is what let a kurta and a running shoe end up inside one signed intent:
 * recall was scoped to the shopper rather than to the conversation, so every
 * sentence they had ever typed came back and the drafter pasted the lot in.
 *
 * DECISION: a trait's predicate is flat (`trait:<key>`) precisely so the write
 * gate's guarded UPDATE supersedes the previous value. A shopper has one shoe
 * size, and the newest statement of it replaces the last. Chat-scoped rows
 * carry the instant for the opposite reason — turns are distinct statements,
 * not revisions of one.
 *
 * DECISION: a trait is written at the same P1 claim as anything else the
 * shopper types. Being durable does not make it more trusted: it still cannot
 * widen a bound, and the write gate still grants the tier. What you told the
 * agent about yourself steers what it looks for; only what you signed moves a
 * ceiling.
 */
export const TRAIT_PREDICATE = "trait";

export function traitPredicate(key: string): string {
  return `${TRAIT_PREDICATE}:${key.trim().toLowerCase()}`;
}

export function isTrait(predicate: string | null): boolean {
  return predicate !== null && predicate.startsWith(`${TRAIT_PREDICATE}:`);
}

export interface TraitMemoryConfig {
  readonly userId: string;
  readonly recallLimit: number;
}

export interface Trait {
  readonly key: string;
  readonly value: string;
}

export class TraitMemory {
  constructor(
    private readonly gateway: GatewayClient,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: TraitMemoryConfig,
  ) {}

  /** Claims P1, like every other thing the shopper says. The gateway grants. */
  async remember(trait: Trait): Promise<boolean> {
    const now = this.clock.now().toISOString();
    const written = await this.gateway.writeMemory({
      type: "preference",
      tier_claim: "P1",
      source_channel: "verified_api",
      sig: null,
      subject: "user",
      predicate: traitPredicate(trait.key),
      source_ref: null,
      content: { key: trait.key, value: trait.value, said_at: now },
      t_valid: now,
      t_invalid: null,
      user_id: this.config.userId,
    });
    if (!written.ok) {
      this.logger.warn("chat.trait.refused", {
        reason_code: written.failure.reasonCode,
      });
      return false;
    }
    return true;
  }

  /** Everything durably known about this shopper, whatever chat it came from. */
  async recall(query: string): Promise<readonly string[]> {
    const rows = await this.rows(query);
    return rows
      .map((content) => sentenceOf(content))
      .filter((line) => line.length > 0)
      .slice(0, this.config.recallLimit);
  }

  /**
   * The same rows, as the pairs a delivery form is filled from.
   *
   * DECISION: a second reading of one store rather than a second store. What
   * fills "City" on a shop's form has to be a thing the shopper said about
   * themselves and nothing else — so it comes back through the trait predicate,
   * past the quarantine flag, exactly as the sentences the model reads do.
   */
  async known(query: string): Promise<readonly Trait[]> {
    const rows = await this.rows(query);
    return rows
      .map((content) => traitOf(content))
      .filter((trait): trait is Trait => trait !== null)
      .slice(0, this.config.recallLimit);
  }

  private async rows(
    query: string,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const found = await this.gateway.retrieveMemory({
      query: query.slice(0, 2000),
      action_class: "chat",
      limit: this.config.recallLimit,
      as_of: null,
      user_id: this.config.userId,
    });
    if (!found.ok) {
      this.logger.warn("chat.trait.recall.refused", {
        reason_code: found.failure.reasonCode,
      });
      return [];
    }
    return found.value.entries
      .filter((entry) => isTrait(entry.predicate) && !entry.quarantined)
      .map((entry) => entry.content);
  }
}

function traitOf(content: Readonly<Record<string, unknown>>): Trait | null {
  const key = content["key"];
  const value = content["value"];
  if (typeof key !== "string" || typeof value !== "string") return null;
  const trait = { key: key.trim(), value: value.trim() };
  return trait.key === "" || trait.value === "" ? null : trait;
}

function sentenceOf(content: Readonly<Record<string, unknown>>): string {
  const trait = traitOf(content);
  return trait === null ? "" : `${trait.key}: ${trait.value}`;
}
