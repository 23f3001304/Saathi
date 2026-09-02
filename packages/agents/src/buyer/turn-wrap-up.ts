import type { Logger } from "@covenant/domain";

import type { AgentSession } from "../shared/agent-session.js";

/**
 * Handed to a model that spent its tool budget mid-sentence.
 *
 * DECISION: one more turn, not a shell sentence. A turn that ran out of round
 * trips has usually written several speculative openings, and the last one is
 * the sentence the model happened to be in the middle of, not an answer. The
 * shell used to replace it with a fixed line of its own. Asking the model to
 * close costs one cheap turn and keeps the voice the shopper is talking to.
 */
export const WRAP_UP_NOTE =
  "You are out of steps this turn. In one line, say where you got to and " +
  "what you need from them; do not call a tool.";

/**
 * The model's own closing line, or nothing: an empty reply emits no bubble,
 * and no bubble beats a sentence nobody in the conversation wrote.
 *
 * It runs on the same session as the turn that ran out, so the model closes
 * knowing what it was in the middle of rather than from a cold start.
 */
export async function wrapUpReply(
  session: AgentSession,
  logger: Logger,
): Promise<string> {
  try {
    const turn = await session.turn({
      userMessage: WRAP_UP_NOTE,
      toolResults: [],
    });
    return turn.text.trim();
  } catch (cause) {
    logger.warn("buyer.turn.wrap_up_failed", {
      cause: cause instanceof Error ? cause.message : "unknown",
    });
    return "";
  }
}
