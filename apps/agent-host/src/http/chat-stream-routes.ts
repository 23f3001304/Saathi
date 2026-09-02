import {
  purgeSandboxProfile,
  windowIdFor,
} from "../browser/sandbox-factory.js";
import type { Hono } from "hono";

import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { AppContext, AppEnv } from "./app-env.js";
import type { ConversationBeatStore } from "./beat-store.js";
import { cursorOf } from "./beat-cursor.js";
import { openSseStream } from "./beat-sse.js";
import type { ChatLane, ChatLanes } from "./chat-lanes.js";
import { readHistory } from "./chat-history.js";
import { lanesReport } from "./lane-attention.js";

const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Nginx and friends buffer by default, which turns a live stream into a dump.
  "X-Accel-Buffering": "no",
};

/**
 * `?conversation=` scopes the wire to one lane. A scoped stream serves that
 * lane's hub and nothing else, which is what makes cross-chat delivery
 * structurally impossible rather than filtered — a client cannot fold a
 * stranger's beats it was never sent. Unscoped keeps the reading it always
 * had: the lane the last run started on, which is the whole host to a CLI or
 * an e2e that never sends an id.
 */
export function laneOf(context: AppContext, lanes: ChatLanes): ChatLane {
  const conversation = context.req.query("conversation") ?? null;
  return conversation === null || conversation === ""
    ? lanes.latest()
    : lanes.laneFor(conversation);
}

/**
 * A scoped answer names the conversation of the *lane*, run or no run. The
 * unscoped answer keeps naming the run's own conversation, because that field
 * is exactly how an unscoped client tells a stranger's run from its own — the
 * ownership dance this route's scoping makes unnecessary, not wrong.
 */
function state(context: AppContext, lanes: ChatLanes): Response {
  const scoped = context.req.query("conversation") ?? null;
  const lane = laneOf(context, lanes);
  const body = lane.chat.state();
  return context.json(
    scoped === null || scoped === ""
      ? body
      : { ...body, conversation: scoped },
    200,
  );
}

/**
 * The conversation surface the Bench reads (§4.10), now lane-addressed:
 * `GET /chat/stream` and `GET /chat/state` take `?conversation=`, and
 * `GET /chat/lanes` is the cheap list a client polls to badge chats that
 * need a person — a question, a pick, a signature, a handoff — while some
 * other chat is on screen.
 */
export function registerChatReads(
  app: Hono<AppEnv>,
  lanes: ChatLanes,
  conversation: ConversationMemory,
  beats: ConversationBeatStore,
): void {
  app.get("/chat/stream", (context) =>
    context.body(
      openSseStream(laneOf(context, lanes).hub, cursorOf(context, "sse")),
      200,
      SSE_HEADERS,
    ),
  );
  app.get("/chat/state", (context) => state(context, lanes));
  app.post("/chat/window/forget", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      conversation?: unknown;
    };
    const conversation = body.conversation;
    if (typeof conversation !== "string" || conversation === "") {
      return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
    }
    await lanes.closeWindow(conversation);
    purgeSandboxProfile(windowIdFor(conversation));
    return context.json({ ok: true }, 200);
  });

  app.get("/chat/lanes", (context) =>
    context.json(
      { ok: true, cap: lanes.cap, running: lanes.running, lanes: lanesReport(lanes) },
      200,
    ),
  );
  app.get("/chat/history", (context) =>
    readHistory(context, conversation, beats),
  );
}
