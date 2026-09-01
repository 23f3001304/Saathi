import { SpokenArguments } from "../providers/spoken-arguments.js";

/**
 * One Anthropic Messages streaming event, as the Agent SDK forwards it on a
 * `stream_event` message when `includePartialMessages` is set.
 *
 * Verified against Anthropic's streaming reference (`POST /v1/messages` with
 * `stream: true`, `anthropic-version: 2023-06-01`): `content_block_delta`
 * carries either a `text_delta` with `text` or an `input_json_delta` with
 * `partial_json`, and `index` addresses the block in the finished message.
 * Only the fields this reader needs are declared, so an event type Anthropic
 * adds later is ignored rather than mis-read — which their own documentation
 * asks consumers to be ready for.
 */
export interface ClaudeStreamEvent {
  readonly type: string;
  readonly index?: number;
  readonly delta?: {
    readonly type?: string;
    readonly text?: string;
    readonly partial_json?: string;
  };
}

/**
 * Prose out of a Claude stream, and nothing else.
 *
 * Text blocks stream straight through. A `tool_use` block's input arrives as
 * partial JSON, and what is read out of it is the shopper-facing `reply` and
 * only that — the call itself is still assembled and run by the SDK, behind
 * the same `PreToolUse` hook, from the complete block. A fragment on this path
 * can reach a screen; it cannot reach a tool.
 */
export class ClaudeStreamReader {
  private readonly spoken = new Map<number, SpokenArguments>();

  read(event: ClaudeStreamEvent): string {
    if (event.type !== "content_block_delta" || event.delta === undefined) {
      return "";
    }
    const { type, text, partial_json: partial } = event.delta;
    if (type === "text_delta") {
      return text ?? "";
    }
    if (type !== "input_json_delta" || partial === undefined) {
      return "";
    }
    return this.readerAt(event.index ?? 0).push(partial);
  }

  private readerAt(index: number): SpokenArguments {
    const held = this.spoken.get(index);
    if (held !== undefined) {
      return held;
    }
    const fresh = new SpokenArguments();
    this.spoken.set(index, fresh);
    return fresh;
  }
}
