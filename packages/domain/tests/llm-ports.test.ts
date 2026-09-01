import { describe, expect, it } from "vitest";

import {
  EMBEDDING_DIMENSIONS,
  type Embedder,
  type PromptJudge,
  type PromptInput,
  type ResponseSchema,
} from "../src/index.js";

/** The §3.5 default: deterministic, local, no network, fixed width. */
class HashingEmbedder implements Embedder {
  async embed(text: string): Promise<Float32Array> {
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);
    for (let index = 0; index < text.length; index += 1) {
      const slot = (text.charCodeAt(index) * 31 + index) % vector.length;
      vector[slot] = (vector[slot] ?? 0) + 1;
    }
    return vector;
  }
}

interface JudgeVerdict {
  readonly contradicts: boolean;
  readonly confidence: number;
}

const verdictSchema: ResponseSchema<JudgeVerdict> = (value) => {
  const raw = value as Partial<JudgeVerdict>;
  if (typeof raw.contradicts !== "boolean") {
    throw new TypeError("contradicts must be a boolean");
  }
  return { contradicts: raw.contradicts, confidence: raw.confidence ?? 0 };
};

class StubJudge implements PromptJudge {
  constructor(private readonly reply: unknown) {}

  async judge<T>(
    _promptId: string,
    _input: PromptInput,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    return schema(this.reply);
  }
}

/** Typed as the port, so the fourth `options` argument stays in the contract. */
function stubJudge(reply: unknown): PromptJudge {
  return new StubJudge(reply);
}

describe("Embedder", () => {
  it("produces the width memory_vec declares", async () => {
    const vector = await new HashingEmbedder().embed("blue running shoes");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("is deterministic, so a replay reproduces the index", async () => {
    const embedder = new HashingEmbedder();
    expect(await embedder.embed("same")).toEqual(await embedder.embed("same"));
  });
});

describe("PromptJudge", () => {
  it("parses a reply through the caller-supplied schema", async () => {
    const judge = stubJudge({ contradicts: true, confidence: 0.91 });
    const verdict = await judge.judge(
      "contradiction-judge.v1",
      { candidate: "{}" },
      verdictSchema,
      { timeoutMs: 2000 },
    );
    expect(verdict).toEqual({ contradicts: true, confidence: 0.91 });
  });

  it("surfaces a parse failure rather than guessing", async () => {
    const judge = stubJudge({ contradicts: "yes" });
    await expect(
      judge.judge("contradiction-judge.v1", {}, verdictSchema, {
        timeoutMs: 2000,
      }),
    ).rejects.toThrow(TypeError);
  });
});
