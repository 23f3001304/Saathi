/**
 * The one place a `WebSocket` is constructed. Everything above talks to
 * `SocketLike`, so a test drives a scripted socket and never opens a
 * connection to Sarvam.
 */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  readonly open: boolean;
}

export type SocketHandlers = {
  readonly onOpen: () => void;
  readonly onMessage: (data: string) => void;
  /** Clean is a normal 1000/1005 close; anything else is a drop worth retrying. */
  readonly onClose: (clean: boolean) => void;
};

export type SocketFactory = (
  url: string,
  protocols: readonly string[],
  handlers: SocketHandlers,
) => SocketLike;

class BrowserSocket implements SocketLike {
  private socket: WebSocket | null;

  constructor(
    url: string,
    protocols: readonly string[],
    handlers: SocketHandlers,
  ) {
    const socket = new WebSocket(url, [...protocols]);
    this.socket = socket;
    socket.onopen = (): void => handlers.onOpen();
    socket.onmessage = (event: MessageEvent): void => {
      if (typeof event.data === "string") handlers.onMessage(event.data);
    };
    socket.onclose = (event: CloseEvent): void => {
      this.socket = null;
      handlers.onClose(event.code === 1000 || event.code === 1005);
    };
    // `error` is always followed by `close`, so the drop is reported once.
    socket.onerror = (): void => undefined;
  }

  get open(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(data: string): void {
    if (this.open) this.socket?.send(data);
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Closing a socket that never finished opening is not an error here.
    }
  }
}

export const browserSocket: SocketFactory = (url, protocols, handlers) =>
  new BrowserSocket(url, protocols, handlers);

export function socketsAvailable(): boolean {
  return typeof WebSocket !== "undefined";
}

/** Bounded exponential backoff: 300ms, 600ms, 1200ms, then give up. */
export const MAX_RETRIES = 3;

export function backoffDelay(attempt: number): number {
  return 300 * 2 ** attempt;
}

/**
 * The reconnect budget for one utterance, timer included. Held here so an
 * adapter reconnects by policy rather than by keeping its own clock, and so
 * `cancel()` is one call on the teardown path.
 */
export class SocketRetry {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  reset(): void {
    this.attempt = 0;
    this.cancel();
  }

  get spent(): boolean {
    return this.attempt >= MAX_RETRIES;
  }

  schedule(run: () => void): void {
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      run();
    }, delay);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
