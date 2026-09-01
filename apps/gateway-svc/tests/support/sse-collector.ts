import { API_VERSION } from "../../src/config.js";

export interface CapturedFrame {
  readonly id: number;
  readonly kind: string;
  readonly seq: number;
}

function framesIn(chunk: string): readonly CapturedFrame[] {
  return chunk
    .split("\n\n")
    .filter((block) => block.startsWith("id: "))
    .map((block) => {
      const [idLine = "", dataLine = ""] = block.split("\n");
      const parsed = JSON.parse(dataLine.slice("data: ".length)) as {
        kind: string;
      };
      return {
        id: Number(idLine.slice("id: ".length)),
        seq: Number(idLine.slice("id: ".length)),
        kind: parsed.kind,
      };
    });
}

/**
 * A real SSE client over `fetch`: it reads the wire format the gateway writes
 * rather than reaching into `LedgerStreamHub`, so the ordering assertion is
 * about what a browser would actually receive.
 */
export class SseCollector {
  readonly frames: CapturedFrame[] = [];
  private readonly abort = new AbortController();
  private pump: Promise<void> | null = null;

  async connect(url: string, lastEventId: number | null = null): Promise<void> {
    const response = await fetch(url, {
      signal: this.abort.signal,
      headers: {
        Accept: "text/event-stream",
        "API-Version": API_VERSION,
        ...(lastEventId === null
          ? {}
          : { "Last-Event-ID": String(lastEventId) }),
      },
    });
    const body = response.body;
    if (body === null) {
      throw new Error("the stream carried no body");
    }
    this.pump = this.read(body);
  }

  /** Frames arrive asynchronously; the caller waits for a count, not a timer. */
  async waitFor(count: number, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.frames.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async close(): Promise<void> {
    this.abort.abort();
    await this.pump?.catch(() => undefined);
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const cut = buffer.lastIndexOf("\n\n");
      if (cut < 0) {
        continue;
      }
      this.frames.push(...framesIn(buffer.slice(0, cut + 2)));
      buffer = buffer.slice(cut + 2);
    }
  }
}
