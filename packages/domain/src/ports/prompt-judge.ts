/** What a sealed prompt is given: labelled data, never instructions (§9.5). */
export type PromptInput = Readonly<Record<string, unknown>>;

/**
 * DECISION: the `schema` parameter of §2.0 is typed as a caller-supplied
 * parse function rather than a `ZodType`. Why: `domain` depends on nothing
 * (§1), so naming zod here would put an npm package in the innermost ring;
 * `(value: unknown) => T` is exactly the part of a schema a judge uses, and a
 * zod schema satisfies it as `(v) => schema.parse(v)`.
 */
export type ResponseSchema<T> = (value: unknown) => T;

export interface PromptJudgeOptions {
  readonly timeoutMs: number;
}

/**
 * The **only** LLM seam inside `packages/`. Prompts are versioned release
 * artifacts addressed by `promptId`; the judge may reject, never approve, and
 * it is off the `verify-cart` latency path (§9.5, decision 42).
 */
export interface PromptJudge {
  judge<T>(
    promptId: string,
    input: PromptInput,
    schema: ResponseSchema<T>,
    options: PromptJudgeOptions,
  ): Promise<T>;
}
