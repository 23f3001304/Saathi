// The live side of the seam: agent-host drives the conversation, the buyer's
// sentence starts a real run, and hold-to-sign releases a real gate.
import { DETECT } from "../voice/ports.ts";
import { readLanguage } from "../voice/voicePreference.ts";
import type { AssistantTransport, SignScope } from "./assistantTransport.ts";
import {
  attach,
  newSession,
  restart,
  restore,
  stop,
  type StreamSession,
} from "./agentStream.ts";

const SIGN_PATH: Record<SignScope, string> = {
  intent: "/chat/intent/sign",
  cart: "/chat/cart/sign",
};

const START_FAILED =
  "I could not reach the agent host, so nothing was started.";

/** The host queues a second sentence now, so this should not be reachable.
 *  Kept, in plain words, for an older host that still refuses one. */
const BUSY = "I am still finishing the last one. Say that again in a moment.";

async function post(
  base: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return await fetch(`${base}${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function reportStartFailure(session: StreamSession, status: number): void {
  session.emit({
    kind: "say",
    text: status === 409 ? BUSY : `${START_FAILED} (HTTP ${status})`,
    system: true,
  });
}

/**
 * History first, then the wire.
 *
 * The transcript is seeded from PTLM before any beat can land, so a reloaded
 * chat opens on the conversation it left rather than filling in behind
 * whatever the host happens to be doing now. `attach` keeps its own rule
 * untouched: a finished run's backlog is still skipped, a run still in flight
 * is still adopted whole.
 */
async function open(
  session: StreamSession,
  conversationId: string | null,
): Promise<void> {
  await restore(session, conversationId);
  if (session.stopped) return;
  await attach(session);
}

/** The host said the message is waiting for a lane. Say so in its words:
 *  the sentence carries the place in line, and the run starts by itself. */
async function reportIfQueued(
  session: StreamSession,
  res: Response,
): Promise<void> {
  const body = (await res.json().catch(() => null)) as {
    status?: unknown;
    human?: unknown;
  } | null;
  if (body?.status !== "queued") return;
  const human =
    typeof body.human === "string" && body.human !== ""
      ? body.human
      : "Every lane is busy right now. This message is in line and starts by itself.";
  session.emit({ kind: "say", text: human, system: true });
}

async function startRun(
  session: StreamSession,
  text: string,
  conversationId: string | null,
): Promise<void> {
  try {
    // The picker is the shopper's explicit instruction; detect sends nothing
    // and the model mirrors their line instead.
    const chosen = readLanguage();
    const res = await post(session.base, "/chat", {
      message: text,
      conversation_id: conversationId,
      reply_language: chosen === DETECT ? null : chosen,
    });
    if (!res.ok) {
      reportStartFailure(session, res.status);
      return;
    }
    await reportIfQueued(session, res);
    // The host rebased its beat indices when the run began and says so on the
    // wire, so this is only a nudge: if the ladder is on a lower rung, a new
    // run is the moment to try climbing back to the socket.
    restart(session);
  } catch {
    session.emit({ kind: "say", text: START_FAILED, system: true });
  }
}

/**
 * `released: false` means the gate was not waiting — `COVENANT_AGENT_AUTOSIGN`
 * already let the run through. That is still a signature the host accepted, so
 * the pen reports success on `ok` and does not invent a refusal.
 */
async function releaseGate(
  base: string,
  scope: SignScope,
  conversationId: string | null,
): Promise<boolean> {
  try {
    // The lane: a signature releases this conversation's gate and no other's.
    const res = await post(base, SIGN_PATH[scope], {
      conversation_id: conversationId,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The id belongs to the chat, not to this transport. It is minted when the
 * chat is created and shelved with it, because one minted here was frozen at
 * mount and reinvented on every reload — which left the previous session's
 * dialogue in PTLM under an id nothing would ever ask for again.
 */
export function liveTransport(
  base: string,
  conversationId: string | null,
): AssistantTransport {
  // A blank id is no id. Both `POST /chat` and the history read require a
  // non-empty one, so letting "" through would not merely lose the history —
  // it would refuse every sentence the shopper typed, as a schema violation.
  const chat = conversationId === "" ? null : conversationId;
  let current: StreamSession | null = null;
  return {
    live: true,
    start: (emit) => {
      const session = newSession(emit, base, chat);
      current = session;
      emit({ kind: "status", status: "connecting", detail: null });
      void open(session, chat);
      return () => {
        stop(session);
        if (current === session) current = null;
      };
    },
    send: (text) => {
      const session = current;
      if (session === null) return;
      session.emit({ kind: "buyer", text });
      void startRun(session, text, chat);
    },
    sign: async (scope) => {
      const released = await releaseGate(base, scope, chat);
      if (released) current?.emit({ kind: "signed", scope });
      return released;
    },
  };
}
