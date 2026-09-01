import type { ServerType } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

import type { AppEnv } from "./app-env.js";
import { cursorOf } from "./beat-cursor.js";
import type { BeatSink } from "./beat-hub.js";
import type { ChatLanes } from "./chat-lanes.js";
import { laneOf } from "./chat-stream-routes.js";
import type { ChatBeat } from "./chat-beat.js";

export const SOCKET_PATH = "/chat/ws";

/** Two unanswered pings. Anything less turns a slow tab into a dropped one. */
const MAX_MISSED_PONGS = 2;

/**
 * The wire, in full. Every frame is one JSON object with a `type`; nothing is
 * positional and nothing is binary, so a socket transcript is as readable in a
 * network pane as the SSE stream it replaces.
 */
export type BeatFrame =
  | {
      readonly type: "beat";
      readonly epoch: number;
      readonly index: number;
      readonly beat: ChatBeat;
    }
  | { readonly type: "rebase"; readonly epoch: number }
  | { readonly type: "ping"; readonly seq: number }
  | { readonly type: "pong"; readonly seq: number };

/** The half of `WSContext` this module uses; keeps `ws` out of our types. */
interface Socket {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

interface Liveness {
  seq: number;
  missed: number;
  timer: NodeJS.Timeout | null;
  detach: (() => void) | null;
}

function sendFrame(socket: Socket, frame: BeatFrame): void {
  try {
    socket.send(JSON.stringify(frame));
  } catch {
    // The peer hung up between the check and the write; `onClose` will follow.
  }
}

function closeQuietly(socket: Socket): void {
  try {
    socket.close(1001, "beat socket idle");
  } catch {
    // Already closed.
  }
}

function socketSink(socket: Socket): BeatSink {
  return {
    deliver: (epoch, index, beat) => {
      sendFrame(socket, { type: "beat", epoch, index, beat });
    },
    rebase: (epoch) => {
      sendFrame(socket, { type: "rebase", epoch });
    },
    close: () => {
      closeQuietly(socket);
    },
  };
}

function textOf(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (!ArrayBuffer.isView(data)) return "";
  return new TextDecoder().decode(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
}

/**
 * A subscriber the hub can no longer reach still holds a replay slot and a
 * timer. The ping is what turns that from a leak into a close: two windows of
 * silence and the connection is hung up rather than waited on.
 */
function pingOrReap(socket: Socket, life: Liveness): void {
  if (life.missed >= MAX_MISSED_PONGS) {
    closeQuietly(socket);
    return;
  }
  life.missed += 1;
  life.seq += 1;
  sendFrame(socket, { type: "ping", seq: life.seq });
}

function parseFrame(raw: unknown): { type?: unknown; seq?: unknown } | null {
  try {
    const parsed: unknown = JSON.parse(textOf(raw) || "null");
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function received(raw: unknown, socket: Socket, life: Liveness): void {
  life.missed = 0;
  const frame = parseFrame(raw);
  if (frame === null) return;
  if (frame.type === "ping" && typeof frame.seq === "number") {
    sendFrame(socket, { type: "pong", seq: frame.seq });
  }
}

function hangUp(life: Liveness): void {
  if (life.timer !== null) clearInterval(life.timer);
  life.timer = null;
  life.detach?.();
  life.detach = null;
}

export interface BeatSocketRoutes {
  readonly injectWebSocket: (server: ServerType) => void;
}

/**
 * `GET /chat/ws` — the same replay the SSE route serves, over a socket that
 * says when it has died instead of hanging open until a proxy reaps it.
 * `?conversation=` picks the lane the same way `/chat/stream` does, and the
 * hub is settled at upgrade: this socket serves that lane for its whole life.
 * `injectWebSocket` must be handed the `node:http` server `serve()` returned;
 * without it the upgrade never reaches this route.
 */
export function registerBeatSocket(
  app: Hono<AppEnv>,
  lanes: ChatLanes,
): BeatSocketRoutes {
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
  app.get(
    SOCKET_PATH,
    upgradeWebSocket((context) => {
      const hub = laneOf(context, lanes).hub;
      const cursor = cursorOf(context, "socket");
      const life: Liveness = { seq: 0, missed: 0, timer: null, detach: null };
      return {
        onOpen: (_event, ws) => {
          life.timer = setInterval(() => {
            pingOrReap(ws, life);
          }, hub.heartbeatMs);
          life.timer.unref();
          life.detach = hub.subscribe(socketSink(ws), cursor);
        },
        onMessage: (event, ws) => {
          received(event.data, ws, life);
        },
        onClose: () => {
          hangUp(life);
        },
        onError: () => {
          hangUp(life);
        },
      };
    }),
  );
  return { injectWebSocket };
}
