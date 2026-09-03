import { describe, expect, it } from "vitest";

import { readOpenAiStream } from "../src/providers/openai-stream.js";
import { collector, sse } from "./stream-fixtures.js";

const OPENAI_STREAM = [
  'data: {"type":"response.output_text.delta","item_id":"m1","delta":"Looking"}',
  'data: {"type":"response.output_text.delta","item_id":"m1","delta":" now."}',
  'data: {"type":"response.function_call_arguments.delta","item_id":"f1","delta":"{\\"reply\\":\\"On it"}',
  'data: {"type":"response.function_call_arguments.delta","item_id":"f1","delta":".\\",\\"question\\":null}"}',
  'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_1","name":"mcp__covenant_merchant__catalog_search","arguments":"{\\"reply\\":\\"On it.\\",\\"query\\":\\"lamp\\"}"}}',
  'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Looking now."}]},{"type":"function_call","call_id":"call_1","name":"mcp__covenant_merchant__catalog_search","arguments":"{\\"query\\":\\"lamp\\"}"}]}}',
].join("\n\n");

describe("openai responses stream", () => {
  it("emits prose and tool-argument prose in the order the model wrote it", async () => {
    const stream = collector();
    await readOpenAiStream(sse(`${OPENAI_STREAM}\n\n`), stream);

    expect(stream.seen.join("")).toBe("Looking now.On it.");
  });

  it("assembles the body the blocking call would have returned", async () => {
    const body = await readOpenAiStream(
      sse(`${OPENAI_STREAM}\n\n`),
      collector(),
    );

    expect(body).toEqual({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "Looking now." }],
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "mcp__covenant_merchant__catalog_search",
          arguments: '{"query":"lamp"}',
        },
      ],
    });
  });
});

/**
 * The property the covenant gate depends on: a decision needs a whole object,
 * so a stream that stops mid-arguments yields no call at all, and a vendor
 * that refuses mid-stream is a refusal rather than a half-answer.
 */
describe("a partial openai stream is not a decision", () => {
  it("yields no tool call from a truncated argument stream", async () => {
    const cut = OPENAI_STREAM.split("\n\n").slice(0, 4).join("\n\n");
    const body = await readOpenAiStream(sse(`${cut}\n\n`), collector());

    expect(body).toEqual({ output: [] });
  });

  it("throws when the vendor refuses mid-stream", async () => {
    const frames = sse(
      'data: {"type":"error","code":"rate_limit","message":"slow down"}\n\n',
    );
    await expect(readOpenAiStream(frames, collector())).rejects.toThrow(
      /openai request failed/,
    );
  });
});

