import { ProviderTransportError } from "./provider-transport.js";
import type { SseFrame } from "./sse-stream.js";
import { readSseJson } from "./sse-stream.js";
import { SpokenArguments } from "./spoken-arguments.js";
import type { TurnStream } from "./turn-stream.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, stringAt } from "./wire-json.js";

/**
 * Verified against OpenAI's own OpenAPI spec for `POST /v1/responses` with
 * `stream: true` and against a live run on 2026-08-31: the stream is a
 * `ResponseStreamEvent` union carrying `response.output_text.delta`,
 * `response.function_call_arguments.delta`, `response.output_item.done` and a
 * terminal `response.completed` whose `response` is the assembled answer.
 * There is no `[DONE]` sentinel on this surface, and the reader switches on
 * the JSON `type` rather than on the SSE event name, because the spec declares
 * the payload and says nothing about the name.
 *
 * DECISION: the reader assembles exactly the body the non-streaming call would
 * have returned and hands it to the same `readReply`. So the tool calls the
 * harness acts on come from one completed, parsed payload on both legs — the
 * stream can move text onto a screen earlier, and cannot move a decision
 * earlier, because there is no second place where a decision is read.
 */
interface Assembly {
  readonly items: JsonRecord[];
  readonly spoken: Map<string, SpokenArguments>;
  final: JsonRecord | null;
}

function itemAt(event: JsonRecord): JsonRecord | null {
  return asRecord(event["item"]);
}

function readArgumentDelta(
  event: JsonRecord,
  state: Assembly,
  stream: TurnStream,
): void {
  const id = stringAt(event, "item_id");
  const reader = state.spoken.get(id) ?? new SpokenArguments();
  state.spoken.set(id, reader);
  const fresh = reader.push(stringAt(event, "delta"));
  if (fresh.length > 0) {
    stream.delta(fresh);
  }
}

function readCompleted(event: JsonRecord, state: Assembly): void {
  const response = asRecord(event["response"]);
  if (response !== null && Array.isArray(response["output"])) {
    state.final = response;
  }
}

function apply(event: JsonRecord, state: Assembly, stream: TurnStream): void {
  const type = stringAt(event, "type");
  if (type === "response.output_text.delta") {
    stream.delta(stringAt(event, "delta"));
    return;
  }
  if (type === "response.function_call_arguments.delta") {
    readArgumentDelta(event, state, stream);
    return;
  }
  if (type === "response.output_item.done") {
    const item = itemAt(event);
    if (item !== null) {
      state.items.push(item);
    }
    return;
  }
  if (type === "response.completed") {
    readCompleted(event, state);
  }
}

/** A mid-stream `error` frame is the vendor refusing, and it reads as one. */
function refusal(event: JsonRecord): ProviderTransportError | null {
  if (stringAt(event, "type") !== "error") {
    return null;
  }
  const detail = `${stringAt(event, "code")} ${stringAt(event, "message")}`;
  return new ProviderTransportError("openai", null, detail.trim());
}

export async function readOpenAiStream(
  frames: AsyncIterable<SseFrame>,
  stream: TurnStream,
): Promise<JsonRecord> {
  const state: Assembly = { items: [], spoken: new Map(), final: null };
  for await (const payload of readSseJson(frames)) {
    const event = asRecord(payload);
    if (event === null) {
      continue;
    }
    const failed = refusal(event);
    if (failed !== null) {
      throw failed;
    }
    apply(event, state, stream);
  }
  return state.final ?? { output: state.items };
}
