import type { Hono } from "hono";
import { z } from "zod";

import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { AppContext, AppEnv } from "./app-env.js";
import type { ConversationBeatStore } from "./beat-store.js";
import type { ChatLanes, StartOutcome } from "./chat-lanes.js";
import { registerChatReads } from "./chat-stream-routes.js";

/**
 * `conversation_id` names the lane. Present, it buys what a 20-minute window
 * was standing in for — which sentences belong together — and now also which
 * runner, which gates, which hub and which window the sentence reaches: one
 * lane per conversation, so two chats' runs cannot share a mutable object.
 * Absent means what it always meant: the id-less default lane the CLI and the
 * e2e drive.
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
 * a URL. The conversation id says whose table the ref is on; a ref another
 * lane's run read reaches no page at all.
 */
const pickRequest = z.object({
  option_id: z.string().min(1).max(64),
  conversation_id: z.string().min(1).max(200).nullish(),
});

const sortKeyRequest = z.object({
  sort_key: z.string().min(1).max(64),
  derived_from_memory_id: z.string().max(200).default(""),
});

/** Which lane a signature or a body-less POST is for. */
const laneRequest = z.object({
  conversation_id: z.string().min(1).max(200).nullish(),
});

/** Started and queued are both a 202: the message was accepted either way,
 *  and `status` plus the honest sentence say which. */
function accepted(context: AppContext, outcome: StartOutcome): Response {
  if (outcome.kind === "queued") {
    return context.json(
      {
        ok: true,
        status: "queued",
        position: outcome.position,
        human: outcome.human,
      },
      202,
    );
  }
  return context.json(
    { ok: true, run_id: outcome.result.runId, status: "running" },
    202,
  );
}

async function start(context: AppContext, lanes: ChatLanes): Promise<Response> {
  const parsed = chatRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  // No 409 anywhere on this path: a busy lane queues the sentence inside
  // itself (it is usually the answer to that run's own question), and a full
  // house queues the lane with its place in line said out loud.
  const outcome = lanes.start(
    parsed.data.message,
    parsed.data.conversation_id ?? null,
    parsed.data.reply_language ?? null,
  );
  return accepted(context, outcome);
}

async function pick(context: AppContext, lanes: ChatLanes): Promise<Response> {
  const parsed = pickRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const outcome = lanes.pick(
    parsed.data.option_id,
    parsed.data.conversation_id ?? null,
  );
  return accepted(context, outcome);
}

async function sortKey(context: AppContext, lanes: ChatLanes): Promise<Response> {
  const parsed = sortKeyRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const memoryId = await lanes.latest().chat.recordSortKey({
    sortKey: parsed.data.sort_key,
    derivedFromMemoryId: parsed.data.derived_from_memory_id,
  });
  return context.json({ ok: memoryId !== null, memory_id: memoryId }, 200);
}

async function cancelRun(
  context: AppContext,
  lanes: ChatLanes,
): Promise<Response> {
  const body = (await context.req.json().catch(() => null)) as {
    conversation_id?: unknown;
  } | null;
  const id = body?.conversation_id;
  if (typeof id !== "string" || id === "") {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  // The lane goes whole: gates refused, hub restarted, window closed, place
  // in line given up. A model call already in flight ends in the background.
  const cancelled = await lanes.cancel(id);
  return context.json({ ok: true, cancelled }, 200);
}

/**
 * A gate releases only on its own lane. The body names the conversation; an
 * id-less signature (the CLI, an older client) falls to the lane the last run
 * started on, which for a single-chat host is the same gate it always was.
 */
async function sign(
  context: AppContext,
  lanes: ChatLanes,
  scope: "intent" | "cart",
): Promise<Response> {
  const parsed = laneRequest.safeParse(
    (await context.req.json().catch(() => null)) ?? {},
  );
  const conversation = parsed.success
    ? (parsed.data.conversation_id ?? null)
    : null;
  const lane =
    conversation === null ? lanes.latest() : lanes.laneFor(conversation);
  const released =
    scope === "intent" ? lane.chat.signIntent() : lane.chat.signCart();
  return context.json({ ok: true, released }, 200);
}

export function registerChat(
  app: Hono<AppEnv>,
  lanes: ChatLanes,
  conversation: ConversationMemory,
  beats: ConversationBeatStore,
): void {
  app.post("/chat", (context) => start(context, lanes));
  app.post("/chat/intent/sign", (context) => sign(context, lanes, "intent"));
  app.post("/chat/cart/sign", (context) => sign(context, lanes, "cart"));
  app.post("/chat/sort-key", (context) => sortKey(context, lanes));
  app.post("/chat/cancel", (context) => cancelRun(context, lanes));
  app.post("/chat/web-pick", (context) => pick(context, lanes));
  registerChatReads(app, lanes, conversation, beats);
}
