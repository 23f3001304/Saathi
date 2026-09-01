import type { Clock } from "@covenant/domain";

/**
 * How far back a sentence still counts as part of what is being said now, for
 * a client too old to say which chat it was typed into.
 *
 * Recall was scoped to the shopper, not to the conversation, so every sentence
 * they had ever typed came back — and the drafter pasted the lot into one
 * intent: "A navy kurta under 2000 rupees, refundable. […] I need running
 * shoes […] — at most 5000.00 INR". A kurta and a running shoe became one
 * signed mandate.
 *
 * The window was the stopgap and the conversation id is the answer: `POST
 * /chat` carries one now, it is written onto every sentence, and recall asks
 * for *this* conversation rather than guessing from the clock. The window
 * survives for the callers that send no id — the CLI and the e2e — where a
 * guess is still better than the whole history.
 */
const RECENT_MINUTES = 20;

export type InScope = (
  content: Readonly<Record<string, unknown>>,
  createdAt: string,
) => boolean;

/** The id when the client sent one, the clock when it did not. */
export function chatScope(chat: string | null, clock: Clock): InScope {
  if (chat !== null) {
    return (content) => content["conversation_id"] === chat;
  }
  const since = new Date(
    clock.now().getTime() - RECENT_MINUTES * 60_000,
  ).toISOString();
  return (_content, createdAt) => createdAt >= since;
}
