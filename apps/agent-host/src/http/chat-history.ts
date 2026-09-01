import { z } from "zod";

import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { Turn } from "../purchase/dialogue.js";
import type { AppContext } from "./app-env.js";
import type { ConversationBeatStore } from "./beat-store.js";

const historyQuery = z.object({
  conversation_id: z.string().min(1).max(200),
});

export interface ConversationLineView {
  readonly speaker: string;
  readonly text: string;
  readonly at: string;
}

function viewOf(turn: Turn): ConversationLineView {
  return { speaker: turn.speaker, text: turn.text, at: turn.at };
}

/**
 * `GET /chat/history?conversation_id=…` — one conversation's dialogue, oldest
 * first, speaker marked.
 *
 * DECISION: this reads through the same `ConversationMemory` the run writes
 * through, rather than querying the gateway from the client or opening a
 * second path to those rows. The words live in PTLM precisely so there is one
 * tiered, gated copy of them; a browser that kept its own would be a second,
 * untiered memory and it would be the one actually feeding the screen.
 *
 * The rows come back as they were filed — P1, `type: "preference"` — and
 * putting them on a screen does not promote them. Only the shopper's half may
 * ever seed an intent, which is a rule `shopperLines` keeps on the run's side
 * and this route has no way to reach.
 *
 * DECISION: `beats` is a new field on this route rather than a new route or a
 * format switch. Why: a client reconstructing a conversation needs the words
 * and the run together, and two routes could be read a run apart and disagree
 * about the same conversation. `lines` is unchanged and still answered first,
 * so a caller that only knows about lines — the CLI, the older Bench — reads
 * exactly what it read before.
 *
 * `cursor` is where the live stream should resume: the `(epoch, index)` of the
 * last beat this log holds. A client that folds the beats and then attaches
 * with that cursor is told only what it has not already seen.
 */
export async function readHistory(
  context: AppContext,
  memory: ConversationMemory,
  beats: ConversationBeatStore,
): Promise<Response> {
  const parsed = historyQuery.safeParse(context.req.query());
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const conversationId = parsed.data.conversation_id;
  const lines = await memory.history(conversationId);
  const restored = beats.history(conversationId);
  return context.json(
    {
      ok: true,
      conversation_id: conversationId,
      lines: lines.map(viewOf),
      beats: restored.beats,
      cursor: restored.cursor,
    },
    200,
  );
}
