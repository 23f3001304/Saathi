import type { CapturedRequest } from "./doubles.js";

export type Wire = Record<string, unknown>;

/** What the adapter actually put on the wire, decoded. */
export function sentBody(request: CapturedRequest | undefined): Wire {
  return JSON.parse(String(request?.init?.body ?? "{}")) as Wire;
}

function items(body: Wire, key: string): readonly Wire[] {
  const value = body[key];
  return Array.isArray(value) ? (value as readonly Wire[]) : [];
}

function typed(body: Wire, key: string, type: string): readonly Wire[] {
  return items(body, key).filter((item) => item["type"] === type);
}

/** One tool result as the model will read it back, provider-shape erased. */
export interface FedBackResult {
  readonly id: string;
  readonly content: string;
}

// --- OpenAI Responses API -------------------------------------------------

export function openAiCall(callId: string, name: string, args: Wire): Wire {
  return {
    output: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: callId,
        name,
        arguments: JSON.stringify(args),
      },
    ],
  };
}

export function openAiText(text: string): Wire {
  return {
    output: [
      { type: "message", content: [{ type: "output_text", text }] },
    ],
  };
}

export function openAiResults(body: Wire): readonly FedBackResult[] {
  return typed(body, "input", "function_call_output").map((item) => ({
    id: String(item["call_id"]),
    content: String(item["output"]),
  }));
}

// --- OpenAI-compatible Chat Completions (Sarvam) --------------------------

export function chatCall(callId: string, name: string, args: Wire): Wire {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

export function chatText(text: string): Wire {
  return {
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }],
  };
}

export function chatResults(body: Wire): readonly FedBackResult[] {
  return items(body, "messages")
    .filter((message) => message["role"] === "tool")
    .map((message) => ({
      id: String(message["tool_call_id"]),
      content: String(message["content"]),
    }));
}

/** Declarations as sent, for the per-provider schema-shape assertions. */
export function declarationsOf(body: Wire): readonly Wire[] {
  return items(body, "tools");
}
