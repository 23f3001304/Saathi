import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

import type { Speaker, Turn } from "./dialogue.js";
import { chatScope } from "./chat-scope.js";
import { byTime, lineOf, recent } from "./dialogue.js";

/**
 * The two predicate families a turn is filed under, so a run finds its own
 * conversation without a query that has to guess at its own wording.
 *
 * DECISION: the instant is part of the predicate. The write gate's guarded
 * UPDATE supersedes live rows sharing `(tenant, user, subject, predicate)`, so
 * a single flat predicate would make each sentence expire the one before it and
 * the conversation would only ever be one line long. Turns are distinct
 * statements, not revisions of one, and the predicate has to say so.
 *
 * DECISION: the agent's own turn gets a family and a subject of its own rather
 * than joining the shopper's. Only one half of a dialogue may bound anything —
 * an intent is drafted from what the shopper stated — and a shared predicate
 * would make the agent's prose indistinguishable from an assertion they made.
 */
export const STATED_REQUEST_PREDICATE = "stated_request";

export const AGENT_REPLY_PREDICATE = "agent_reply";

export function statedPredicateAt(instant: string): string {
  return `${STATED_REQUEST_PREDICATE}@${instant}`;
}

export function agentPredicateAt(instant: string): string {
  return `${AGENT_REPLY_PREDICATE}@${instant}`;
}

function speakerOf(predicate: string | null): Speaker | null {
  if (predicate === null) return null;
  if (predicate.startsWith(STATED_REQUEST_PREDICATE)) return "user";
  return predicate.startsWith(AGENT_REPLY_PREDICATE) ? "agent" : null;
}

export interface ConversationMemoryConfig {
  readonly userId: string;
  readonly recallLimit: number;
}

export interface StatedMemory {
  readonly memoryId: string | null;
  readonly tierGranted: string | null;
  readonly status: string;
}

/**
 * The conversation — both halves of it — kept in PTLM rather than in a buffer
 * beside it.
 *
 * DECISION: a turn is written **P1 through `verified_api`**, the same claim
 * `ChatService.recordSortKey` makes and for the same reason. It arrived on the
 * host's own surface, so the channel is verified; it carries no user signature,
 * so it is not `user_confirmation`. P3 is the tier that justifies money, and an
 * unsigned sentence must never be entitled to widen a bound — what you typed
 * can steer the search, only what you signed can move the ceiling. The
 * gateway's write gate refuses a claim above its channel
 * (`TIER_CLAIM_EXCEEDS_CHANNEL`), so this is a claim, never an assertion.
 *
 * DECISION: `type: "preference"` for the agent's half as well as the shopper's,
 * never `type: "fact"`. The write gate requires a higher tier for a fact, and
 * the ledger already carries the refusals to prove it. A sentence is not more
 * trusted for having come from us: the agent's own prose still cannot widen a
 * bound, and only a signature ever can.
 *
 * DECISION: no per-session chat buffer anywhere. A hidden history array beside
 * PTLM would be a second, untiered memory — and it would be the one actually
 * driving purchases, which is exactly the thing this system exists to make
 * impossible. Because the conversation lives here, the sentences that produced
 * an intent are inside the memory digest the Cart Mandate binds.
 */
export class ConversationMemory {
  constructor(
    private readonly gateway: GatewayClient,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: ConversationMemoryConfig,
  ) {}

  /** What the shopper typed. */
  remember(
    text: string,
    chat: string | null = null,
  ): Promise<StatedMemory | null> {
    return this.write("user", text, chat);
  }

  /**
   * What the agent said back. Without it `recall` returned a monologue: "yes"
   * arrived with no antecedent, the model could not see the offer it had just
   * made, and it re-offered the same thing every turn until the shopper gave up.
   */
  rememberAgent(
    text: string,
    chat: string | null = null,
  ): Promise<StatedMemory | null> {
    return this.write("agent", text, chat);
  }

  /**
   * The dialogue, oldest first, with the speaker kept. Retrieval is `chat`:
   * tier floor P0 and quarantined rows visible, which is why they are filtered
   * out here — an untrusted line that reached the corpus is not something
   * either party said.
   */
  recall(query: string, chat: string | null = null): Promise<readonly Turn[]> {
    return this.read(query, chat);
  }

  /**
   * One conversation read back whole, for a client rehydrating a chat a reload
   * emptied. Read-only, and that is the point: restoring a transcript writes
   * nothing, or every reload would file the dialogue again and the memory the
   * Cart Mandate binds would grow a copy of itself per refresh.
   *
   * DECISION: the id is the query. Retrieval ranks before it slices, and every
   * row of a conversation carries its id in `content` — so asking for the id
   * puts this conversation at the top of the ranking rather than hoping the
   * shopper's last sentence happened to sit near the rest of it.
   */
  history(chat: string): Promise<readonly Turn[]> {
    return this.read(chat, chat);
  }

  private async read(
    query: string,
    chat: string | null,
  ): Promise<readonly Turn[]> {
    const found = await this.gateway.retrieveMemory({
      query: query.slice(0, 2000),
      action_class: "chat",
      limit: this.config.recallLimit,
      as_of: null,
      user_id: this.config.userId,
      // Scoped in the query, not after it: the gate cuts to `limit` over the
      // whole corpus, and the client-side filter below can only ever shrink
      // that slice — with enough other chats, to nothing.
      conversation_id: chat,
    });
    if (!found.ok) {
      this.logger.warn("chat.recall.refused", {
        reason_code: found.failure.reasonCode,
      });
      return [];
    }
    const inScope = chatScope(chat, this.clock);
    const said = found.value.entries
      .filter((entry) => !entry.quarantined)
      .filter((entry) => inScope(entry.content, entry.t_created))
      .map((entry) => lineOf(speakerOf(entry.predicate), entry))
      .filter((line): line is Turn => line !== null)
      .sort(byTime);
    return recent(said, this.config.recallLimit);
  }

  private async write(
    speaker: Speaker,
    text: string,
    chat: string | null,
  ): Promise<StatedMemory | null> {
    const now = this.clock.now().toISOString();
    const written = await this.gateway.writeMemory({
      type: "preference",
      tier_claim: "P1",
      source_channel: "verified_api",
      sig: null,
      subject: speaker,
      predicate:
        speaker === "user" ? statedPredicateAt(now) : agentPredicateAt(now),
      source_ref: null,
      content: { text, said_at: now, conversation_id: chat },
      t_valid: now,
      t_invalid: null,
      user_id: this.config.userId,
    });
    if (!written.ok) {
      this.logger.warn("chat.turn.refused", {
        speaker,
        reason_code: written.failure.reasonCode,
      });
      return null;
    }
    return {
      memoryId: written.value.memory_id,
      // The gateway's answer, never the claim above.
      tierGranted: written.value.tier_granted,
      status: written.value.status,
    };
  }
}
