import type { Hono } from "hono";
import { z } from "zod";

import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { BeatHub } from "./beat-hub.js";
import type { AppContext, AppEnv } from "./app-env.js";
import type { ConversationBeatStore } from "./beat-store.js";
import { cursorOf } from "./beat-cursor.js";
import { readHistory } from "./chat-history.js";
import { openSseStream } from "./beat-sse.js";
import type { ChatService } from "./chat-service.js";

const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Nginx and friends buffer by default, which turns a live stream into a dump.
  "X-Accel-Buffering": "no",
};

/**
 * `conversation_id` is optional, and absent means exactly what it always
 * meant: one shopper, one timeline. The CLI and the e2e post without it. What
 * it buys when present is the thing a 20-minute window was standing in for —
 * which sentences belong together. Recall scoped to the shopper rather than to
 * the conversation is how a kurta and a running shoe ended up inside one
 * signed intent, and an intent is the one thing here that has to be precise.
 */
const chatRequest = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().min(1).max(200).nullish(),
  /** The app's language picker: the shopper's explicit instruction, or absent
   *  for detect — never a detected value. */
  reply_language: z.string().min(2).max(16).nullish(),
});

/**
 * A tapped open-web card, named by the ref this host minted for it — never by
 * a URL. The client can only ever say "the one you called w3", and the host
 * looks up which page that was (`WebFindings`, `resolve-identity.ts`'s rule).
 * A ref this run never read reaches no page at all.
 */
const pickRequest = z.object({ option_id: z.string().min(1).max(64) });

const sortKeyRequest = z.object({
  sort_key: z.string().min(1).max(64),
  derived_from_memory_id: z.string().max(200).default(""),
});

async function start(
  context: AppContext,
  chat: ChatService,
): Promise<Response> {
  const parsed = chatRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  // No 409 here any more. A second sentence queues behind the run in flight
  // (`ChatService.start`) rather than being refused, because the sentence most
  // likely to arrive during a run is the shopper answering the agent's own
  // question — and losing that one is the worst turn to lose.
  const started = chat.start(
    parsed.data.message,
    parsed.data.conversation_id ?? null,
    parsed.data.reply_language ?? null,
  );
  return context.json(
    { ok: true, run_id: started.runId, status: "running" },
    202,
  );
}

async function pick(context: AppContext, chat: ChatService): Promise<Response> {
  const parsed = pickRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  // A ref this run never read is not a 404: it is a turn that has to answer,
  // and it answers in the shopper's own thread — "I no longer have that
  // listing". A silent status code leaves them staring at a tapped card.
  const started = chat.pick(parsed.data.option_id);
  return context.json(
    { ok: true, run_id: started.runId, status: "running" },
    202,
  );
}

async function sortKey(
  context: AppContext,
  chat: ChatService,
): Promise<Response> {
  const parsed = sortKeyRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const memoryId = await chat.recordSortKey({
    sortKey: parsed.data.sort_key,
    derivedFromMemoryId: parsed.data.derived_from_memory_id,
  });
  return context.json({ ok: memoryId !== null, memory_id: memoryId }, 200);
}

/**
 * The conversation surface `apps/audit-ui/src/api/agent.ts` expects (§4.10):
 * `POST /chat`, `GET /chat/stream`, `POST /chat/sort-key`. The two signing
 * routes are the hold-to-sign gates the Bench's `SigningSheet` releases; the
 * gateway never proxies any of this, because the ledger is the verifier's
 * record and chat is the agent's word.
 *
 * `GET /chat/ws` (registered separately, because the upgrade needs the
 * `node:http` server) is the same replay over a socket. This route stays: it
 * is the documented fallback and the rung a client lands on when the socket
 * cannot be had.
 *
 * `GET /chat/history` is the one read among them, and it now answers from both
 * sources: the dialogue PTLM holds, and the durable beat log, which is the run
 * itself — the option cards, the pills, the cart, the verdict, the sandbox's
 * action list. The in-memory hub is still what a *live* client follows; the log
 * is what makes the same conversation reconstructible by a client that was not
 * there when it happened.
 */
async function cancelRun(
  context: AppContext,
  chat: ChatService,
  browser: { close: () => Promise<void> },
): Promise<Response> {
  const body = (await context.req.json().catch(() => null)) as {
    conversation_id?: unknown;
  } | null;
  const id = body?.conversation_id;
  if (typeof id !== "string" || id === "") {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const cancelled = chat.cancel(id);
  // The window follows the chat that owned it out.
  if (cancelled) await browser.close().catch(() => undefined);
  return context.json({ ok: true, cancelled }, 200);
}

export function registerChat(
  app: Hono<AppEnv>,
  chat: ChatService,
  hub: BeatHub,
  conversation: ConversationMemory,
  beats: ConversationBeatStore,
  browser: { close: () => Promise<void> },
): void {
  app.post("/chat", (context) => start(context, chat));
  app.get("/chat/stream", (context) =>
    context.body(
      openSseStream(hub, cursorOf(context, "sse")),
      200,
      SSE_HEADERS,
    ),
  );
  app.get("/chat/state", (context) => context.json(chat.state(), 200));
  app.get("/chat/history", (context) =>
    readHistory(context, conversation, beats),
  );
  app.post("/chat/intent/sign", (context) =>
    context.json({ ok: true, released: chat.signIntent() }, 200),
  );
  app.post("/chat/cart/sign", (context) =>
    context.json({ ok: true, released: chat.signCart() }, 200),
  );
  app.post("/chat/sort-key", (context) => sortKey(context, chat));
  app.post("/chat/cancel", (context) => cancelRun(context, chat, browser));
  app.post("/chat/web-pick", (context) => pick(context, chat));
}
