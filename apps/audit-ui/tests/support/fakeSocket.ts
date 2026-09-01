// Scripted stand-ins for the streaming stack. Nothing here opens a real
// connection: every test drives the adapter by calling these by hand.
import type {
  SocketFactory,
  SocketHandlers,
  SocketLike,
} from "../../src/voice/voiceSocket.ts";
import type { PcmCapture } from "../../src/voice/pcmCapture.ts";
import type { ChunkPlayer } from "../../src/voice/streamPlayer.ts";

export type FakeSocket = SocketLike & {
  readonly url: string;
  readonly protocols: readonly string[];
  readonly sent: string[];
  readonly handlers: SocketHandlers;
  closed: boolean;
  /** Accept the handshake, as the server does on a good key. */
  accept(): void;
  /** Deliver one server frame. */
  deliver(frame: unknown): void;
  /** Die the way a dropped connection does — an unclean close. */
  drop(): void;
};

export function fakeSockets(): {
  connect: SocketFactory;
  sockets: FakeSocket[];
  live: () => FakeSocket[];
} {
  const sockets: FakeSocket[] = [];
  const connect: SocketFactory = (url, protocols, handlers) => {
    const socket: FakeSocket = {
      url,
      protocols,
      handlers,
      sent: [],
      closed: false,
      open: false,
      send: (data: string): void => {
        socket.sent.push(data);
      },
      close: (): void => {
        socket.closed = true;
        (socket as { open: boolean }).open = false;
      },
      accept: (): void => {
        (socket as { open: boolean }).open = true;
        handlers.onOpen();
      },
      deliver: (frame: unknown): void =>
        handlers.onMessage(JSON.stringify(frame)),
      drop: (): void => {
        (socket as { open: boolean }).open = false;
        socket.closed = true;
        handlers.onClose(false);
      },
    };
    sockets.push(socket);
    return socket;
  };
  return { connect, sockets, live: () => sockets.filter((s) => !s.closed) };
}

export type FakeCapture = PcmCapture & {
  starts: number;
  stops: number;
  running: boolean;
  /** Push one frame of microphone audio through the adapter. */
  emit(bytes: number): void;
};

export function fakeCapture(failWith?: Error): FakeCapture {
  let sink: ((pcm: Uint8Array) => void) | null = null;
  const capture: FakeCapture = {
    starts: 0,
    stops: 0,
    running: false,
    start: async (onFrame): Promise<void> => {
      capture.starts += 1;
      if (failWith !== undefined) throw failWith;
      sink = onFrame;
      capture.running = true;
    },
    stop: (): void => {
      capture.stops += 1;
      capture.running = false;
      sink = null;
    },
    emit: (bytes: number): void => sink?.(new Uint8Array(bytes)),
  };
  return capture;
}

export type FakePlayer = ChunkPlayer & {
  readonly chunks: Uint8Array[];
  sealed: boolean;
  stops: number;
  /** Playback reached the end of what was pushed. */
  finish(): void;
  fail(): void;
};

export function fakePlayer(): FakePlayer {
  let done: (() => void) | null = null;
  let failed: (() => void) | null = null;
  const player: FakePlayer = {
    chunks: [],
    sealed: false,
    stops: 0,
    open: (onDone, onFail): void => {
      done = onDone;
      failed = onFail;
    },
    push: (bytes): void => {
      player.chunks.push(bytes);
    },
    seal: (): void => {
      player.sealed = true;
    },
    stop: (): void => {
      player.stops += 1;
    },
    finish: (): void => done?.(),
    fail: (): void => failed?.(),
  };
  return player;
}
