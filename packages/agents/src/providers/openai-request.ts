import type { ToolDeclaration } from "./tool-declarations.js";
import { wireNameOf } from "./tool-declarations.js";
import type { JsonRecord } from "./wire-json.js";

export type ReasoningEffort = "low" | "medium" | "high";

export interface OpenAiSessionConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
  /** Reasoning effort. Absent, the API default applies, which for a
   *  reasoning model is far below what it can do. */
  readonly reasoningEffort?: ReasoningEffort;
  /** Hosted tools sent verbatim beside the function tools; in use:
   *  `{type: "web_search"}` for research. */
  readonly hostedTools?: readonly JsonRecord[];
}

/** The Responses API's flat declaration, `strict: false` because zod's
 *  nullable ints become `anyOf`, which the strict subset rejects; each tool
 *  verifies its own AM2 envelope, so validity is enforced where it matters. */
function declarationPayload(declaration: ToolDeclaration): JsonRecord {
  return {
    type: "function",
    name: wireNameOf(declaration),
    description: declaration.description,
    parameters: declaration.parameters,
    strict: false,
  };
}

/**
 * One `POST /v1/responses` body. `store: false` and the whole history resent
 * each turn: a payments harness should not opt into server-side retention
 * silently, and a stateless request is the one whose replay is deterministic.
 */
export function openAiRequestBody(
  config: OpenAiSessionConfig,
  items: readonly JsonRecord[],
): JsonRecord {
  return {
    model: config.model,
    instructions: config.systemPrompt,
    input: [...items],
    tools: [
      ...(config.hostedTools ?? []),
      ...config.tools.map(declarationPayload),
    ],
    tool_choice: "auto",
    store: false,
    ...(config.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: config.reasoningEffort } }),
  };
}
