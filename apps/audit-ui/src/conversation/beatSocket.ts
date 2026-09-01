// The top rung: agent-host's `GET /chat/ws`. Frames are JSON objects with a
// `type` — `beat`, `rebase`, `ping`, `pong` — and the beat payload is the same
// object `/chat/stream` puts on a `data:` line, so the two rungs parse through
// the same admission check.
import { parseBeat, type AgentBeat } from "../api/agentBeat.ts";

export const SOCKET_PATH = "/chat/ws";

/** Long enough for a cold host to answer, short enough to fall past a black hole. */
const CONNECT_TIMEOUT_MS = 4_000;

/** The host pings every 15s; this is that window plus room for a slow tab. */
const IDLE_MS = 22_000;

const PONG_TIMEOUT_MS = 5_000;

export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onBeat: (epoch: number, index: number, beat: AgentBeat) => void;
  readonly onRebase: (epoch: number) => void;
  readonly onDead: (detail: string) => void;
}

export interface BeatSocket {
  readonly close: () => void;
}

interface Guard {
  readonly socket: WebSocket;
  readonly handlers: SocketHandlers;
  idle: ReturnType<typeof setTimeout> | null;
  pong: ReturnType<typeof setTimeout> | null;
  seq: number;
  done: boolean;
}

export function beatSocketUrl(
  base: string,
  after: number,
  epoch: number,
  conversation: string | null = null,
): string {
  const url = new URL(`${base}${SOCKET_PATH}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("after", String(after));
  if (epoch > 0) url.searchParams.set("epoch", String(epoch));
  // The lane: a scoped socket serves one conversation's hub and nothing else.
  if (conversation !== null && conversation !== "")
    url.searchParams.set("conversation", conversation);
  return url.toString();
}

function send(guard: Guard, frame: { type: string; seq: number }): void {
  try {
    guard.socket.send(JSON.stringify(frame));
  } catch {
    // The socket is on its way down; `onclose` is what will say so.
  }
}

function stopTimers(guard: Guard): void {
  if (guard.idle !== null) clearTimeout(guard.idle);
  if (guard.pong !== null) clearTimeout(guard.pong);
  guard.idle = null;
  guard.pong = null;
}

function die(guard: Guard, detail: string): void {
  if (guard.done) return;
  guard.done = true;
  stopTimers(guard);
  try {
    guard.socket.close();
  } catch {
    // Already gone.
  }
  guard.handlers.onDead(detail);
}

/**
 * DECISION: the client keeps its own liveness clock rather than trusting the
 * host's ping to arrive. Why: the failure this whole change exists to survive
 * is a connection that is dead without either end being told — a suspended
 * laptop, a proxy that reaped an idle socket. Waiting to be pinged detects
 * nothing in that case; sending one and timing the answer detects it in five
 * seconds.
 */
function probe(guard: Guard): void {
  guard.seq += 1;
  send(guard, { type: "ping", seq: guard.seq });
  guard.pong = setTimeout(() => {
    die(guard, "the connection stopped answering");
  }, PONG_TIMEOUT_MS);
}

/** Any frame at all is proof of life, so every one of them rearms the clock. */
function arm(guard: Guard): void {
  stopTimers(guard);
  if (guard.done) return;
  guard.idle = setTimeout(() => {
    probe(guard);
  }, IDLE_MS);
}

function numberAt(source: object, key: string): number | null {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** True when the frame carried nothing but liveness. */
function answeredPing(guard: Guard, frame: Record<string, unknown>): boolean {
  if (frame["type"] !== "ping") return frame["type"] === "pong";
  send(guard, { type: "pong", seq: numberAt(frame, "seq") ?? 0 });
  return true;
}

function dispatch(guard: Guard, frame: Record<string, unknown>): void {
  if (answeredPing(guard, frame)) return;
  const epoch = numberAt(frame, "epoch");
  if (epoch === null) return;
  if (frame["type"] === "rebase") {
    guard.handlers.onRebase(epoch);
    return;
  }
  const index = numberAt(frame, "index");
  const beat = parseBeat(frame["beat"]);
  if (index !== null && beat !== null)
    guard.handlers.onBeat(epoch, index, beat);
}

function objectOf(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function received(guard: Guard, raw: string): void {
  arm(guard);
  const frame = objectOf(raw);
  if (frame !== null) dispatch(guard, frame);
}

function wire(guard: Guard): void {
  guard.pong = setTimeout(() => {
    die(guard, "the connection never opened");
  }, CONNECT_TIMEOUT_MS);
  guard.socket.onopen = () => {
    arm(guard);
    guard.handlers.onOpen();
  };
  guard.socket.onmessage = (event: MessageEvent<string>) => {
    received(guard, String(event.data));
  };
  guard.socket.onerror = () => {
    die(guard, "the connection failed");
  };
  guard.socket.onclose = () => {
    die(guard, "the connection closed");
  };
}

/** `null` when this runtime cannot open one at all; the ladder steps down. */
export function openBeatSocket(
  url: string,
  handlers: SocketHandlers,
): BeatSocket | null {
  if (typeof WebSocket === "undefined") return null;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    return null;
  }
  const guard: Guard = {
    socket,
    handlers,
    idle: null,
    pong: null,
    seq: 0,
    done: false,
  };
  wire(guard);
  return {
    close: () => {
      guard.done = true;
      stopTimers(guard);
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    },
  };
}
