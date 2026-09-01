import type { SseFrame } from "./sse-stream.js";
import { readSseJson } from "./sse-stream.js";
import { SpokenArguments } from "./spoken-arguments.js";
import type { TurnStream } from "./turn-stream.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, recordsAt, stringAt } from "./wire-json.js";

/**
 * The OpenAI-compatible `chat.completion.chunk` stream, which is what Sarvam
 * documents at `POST /v1/chat/completions` with `stream: true`: data-only
 * frames carrying `choices[0].delta`, a terminal `data: [DONE]`, and a final
 * usage chunk whose `choices` array is empty.
 *
 * Sarvam's own reference documents streamed `delta.content` but does **not**
 * document streamed `tool_calls`, so the tool-call half here is written to
 * OpenAI's spec — `index` is the reassembly key, `id` and `function.name`
 * arrive once on the first fragment of each call — and a vendor that never
 * sends one simply produces no calls, exactly as the blocking path would.
 *
 * DECISION: as on the Responses adapter, the reader assembles the body the
 * blocking call would have returned and hands it to the same reply reader. The
 * arguments the harness acts on are the concatenated whole, parsed once.
 */
interface Call {
  id: string;
  name: string;
  args: string;
  readonly spoken: SpokenArguments;
}

interface Assembly {
  text: string;
  readonly calls: Map<number, Call>;
}

function callAt(state: Assembly, index: number): Call {
  const held = state.calls.get(index);
  if (held !== undefined) {
    return held;
  }
  const fresh: Call = {
    id: "",
    name: "",
    args: "",
    spoken: new SpokenArguments(),
  };
  state.calls.set(index, fresh);
  return fresh;
}

function readCall(
  fragment: JsonRecord,
  state: Assembly,
  stream: TurnStream,
): void {
  const index = fragment["index"];
  const call = callAt(state, typeof index === "number" ? index : 0);
  call.id = stringAt(fragment, "id") || call.id;
  const fn = asRecord(fragment["function"]);
  if (fn === null) {
    return;
  }
  call.name = stringAt(fn, "name") || call.name;
  const args = stringAt(fn, "arguments");
  call.args += args;
  const fresh = call.spoken.push(args);
  if (fresh.length > 0) {
    stream.delta(fresh);
  }
}

function readDelta(
  delta: JsonRecord,
  state: Assembly,
  stream: TurnStream,
): void {
  const content = stringAt(delta, "content");
  if (content.length > 0) {
    state.text += content;
    stream.delta(content);
  }
  for (const fragment of recordsAt(delta, "tool_calls")) {
    readCall(fragment, state, stream);
  }
}

function callPayload(call: Call): JsonRecord {
  return {
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.args },
  };
}

function assembled(state: Assembly): JsonRecord {
  const calls = [...state.calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => callPayload(call));
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: state.text,
          ...(calls.length > 0 ? { tool_calls: calls } : {}),
        },
      },
    ],
  };
}

export async function readChatCompletionsStream(
  frames: AsyncIterable<SseFrame>,
  stream: TurnStream,
): Promise<JsonRecord> {
  const state: Assembly = { text: "", calls: new Map() };
  for await (const payload of readSseJson(frames)) {
    for (const choice of recordsAt(asRecord(payload) ?? {}, "choices")) {
      const delta = asRecord(choice["delta"]);
      if (delta !== null) {
        readDelta(delta, state, stream);
      }
    }
  }
  return assembled(state);
}
