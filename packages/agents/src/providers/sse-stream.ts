/** One server-sent event: the name the vendor gave it, and its data lines. */
export interface SseFrame {
  readonly event: string | null;
  readonly data: string;
}

/** Chat Completions and Gemini end with this; Responses and Anthropic do not. */
export const SSE_DONE = "[DONE]";

function frameOf(block: string): SseFrame | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  return data.length === 0 ? null : { event, data: data.join("\n") };
}

/**
 * Frames off a `text/event-stream` body.
 *
 * DECISION: the four vendors disagree about whether an `event:` name is
 * present at all — OpenAI's spec declares only the payload, Anthropic
 * documents both a name and a matching `type` inside the data — so this reader
 * hands back whatever it saw and every adapter switches on the JSON instead.
 * A vendor that stops sending names cannot break a reader that never read one.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const frame = frameOf(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      if (frame !== null) {
        yield frame;
      }
      cut = buffer.indexOf("\n\n");
    }
  }
  const last = frameOf(buffer);
  if (last !== null) {
    yield last;
  }
}

/** The parsed payload of every frame that carried one, `[DONE]` excluded. */
export async function* readSseJson(
  frames: AsyncIterable<SseFrame>,
): AsyncGenerator<unknown> {
  for await (const frame of frames) {
    if (frame.data === SSE_DONE) {
      return;
    }
    const parsed = parseOrNull(frame.data);
    if (parsed !== null) {
      yield parsed;
    }
  }
}

/** A vendor that sends a keep-alive or a shape we cannot read is skipped, not
 *  thrown at: a stream must not die mid-answer over one unreadable frame. */
function parseOrNull(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}
