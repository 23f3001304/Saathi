import type {
  AgentToolRequest,
  AgentToolResult,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import type { GuardedToolDispatcher } from "./guarded-tool-dispatcher.js";
import { RepeatGuard } from "./repeat-guard.js";
import type { Draft, DraftScope } from "./turn-stream.js";
import { SILENT_DRAFT, SUPERSEDED } from "./turn-stream.js";

export interface ProviderReply {
  readonly text: string;
  readonly toolRequests: readonly AgentToolRequest[];
}

/**
 * The provider-specific half of an adapter: conversation state plus one model
 * round trip. Everything an adapter has to get right that is *not* the tool
 * gate lives behind this interface; the gate lives in `runGuardedTurn`.
 *
 * `send()` is responsible for recording its own reply into the conversation
 * (the assistant text and any function-call items), because every one of these
 * APIs is stateless in the mode we use and needs the model's own turn echoed
 * back before the matching tool results.
 */
export interface ProviderExchange {
  appendUser(text: string): void;
  appendToolResults(results: readonly AgentToolResult[]): void;
  send(): Promise<ProviderReply>;
  /**
   * The same round trip with the prose forwarded as it arrives. Optional on
   * purpose: the port supports both, and an adapter that has no verified
   * streaming shape simply does not declare one and keeps working unchanged.
   * It must still return the *complete* reply, assembled and parsed in full —
   * the guarantee is that `send` and `sendStreaming` differ in when text is
   * seen, never in what the harness is handed.
   */
  sendStreaming?(stream: Draft): Promise<ProviderReply>;
  reset(): void;
}

export const DEFAULT_MAX_TOOL_ITERATIONS = 8;

/**
 * One round trip, with its own draft. A turn may take several — the model
 * says something, calls a tool, and speaks again on the far side of it — and
 * each of those is one bubble's worth of prose, not a continuation of the
 * last. Before this, a preamble and the answer that followed a tool result
 * were concatenated into one sentence with no join: "…see the options?You
 * requested…".
 */
async function sendOnce(
  exchange: ProviderExchange,
  draft: Draft | null,
): Promise<ProviderReply> {
  if (draft === null || exchange.sendStreaming === undefined) {
    return exchange.send();
  }
  try {
    const reply = await exchange.sendStreaming(draft);
    draft.settle();
    return reply;
  } catch (cause) {
    draft.withdraw(DRAFT_CALL_FAILED);
    throw cause;
  }
}

export const DRAFT_CALL_FAILED = "the model call did not finish";

/**
 * The next round trip takes the screen from the last one, and only once it has
 * something to put there. Withdrawing the preamble the moment a new call is
 * *started* would blank the bubble for the length of that call; withdrawing it
 * on the first fragment of the reply swaps one for the other in place. A round
 * trip that produces no prose at all — a bare tool call — supersedes nothing.
 */
function superseding(previous: Draft, draft: Draft): Draft {
  let started = false;
  return {
    id: draft.id,
    delta: (text) => {
      if (!started) {
        started = true;
        previous.withdraw(SUPERSEDED);
      }
      draft.delta(text);
    },
    settle: () => draft.settle(),
    withdraw: (reason) => draft.withdraw(reason),
  };
}

function prime(exchange: ProviderExchange, input: AgentTurnInput): void {
  if (input.userMessage !== null) {
    exchange.appendUser(input.userMessage);
  }
  if (input.toolResults.length > 0) {
    exchange.appendToolResults(input.toolResults);
  }
}

/** `null` when nobody is watching, which is what keeps the blocking path the
 *  blocking path: an adapter with `sendStreaming` still uses `send`. */
function nextDraft(drafts: DraftScope | null, previous: Draft): Draft | null {
  const draft = drafts?.open() ?? null;
  return draft === null ? null : superseding(previous, draft);
}

/**
 * One `AgentSession.turn()` for a provider with no hook of its own.
 *
 * This function is the single place where a non-Claude tool call is executed,
 * and it can only execute one by handing it to `GuardedToolDispatcher`. Three
 * adapters, one gate: adding a fourth provider cannot reintroduce the bypass,
 * because an adapter that wanted to skip the gate would have to stop using
 * this loop, and then it would have no loop at all.
 *
 * `toolRequests` comes back empty for the same reason it does on
 * `ClaudeAgentSession`: the tool loop runs to completion inside the adapter,
 * so `BuyerAgent` is never handed a pending call to approve. Both paths are
 * gated before execution, just at different depths.
 */
export async function runGuardedTurn(
  exchange: ProviderExchange,
  guard: GuardedToolDispatcher,
  input: AgentTurnInput,
  maxIterations: number,
  drafts: DraftScope | null = null,
): Promise<AgentTurn> {
  prime(exchange, input);
  const chunks: string[] = [];
  const tried = new RepeatGuard();
  let previous: Draft = SILENT_DRAFT;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const draft = nextDraft(drafts, previous);
    const reply = await sendOnce(exchange, draft);
    previous = draft ?? SILENT_DRAFT;
    if (reply.text.length > 0) {
      chunks.push(reply.text);
    }
    if (reply.toolRequests.length === 0) {
      return { text: joined(chunks), toolRequests: [], done: true };
    }
    const again = tried.noProgress(reply.toolRequests);
    // Dispatched even when the round is about to end: these calls are already
    // in the model's conversation, and a function call left without its result
    // makes the next turn on that session a 400 rather than a turn.
    const results = await guard.dispatchAll(reply.toolRequests);
    tried.record(reply.toolRequests, results);
    exchange.appendToolResults(results);
    if (again || results.some((result) => result.terminal === true)) {
      // Nothing another round trip can do. Asking a merchant for a SKU their
      // shelf does not carry is not a transient error, and the loop used to
      // spend its whole budget re-asking — sixteen superseded sentences and no
      // card. The results are still appended, so the conversation records the
      // refusal rather than the turn simply stopping.
      return { text: joined(chunks), toolRequests: [], done: true };
    }
  }
  // Budget exhausted mid-loop: `done: false` says the model was still working.
  return { text: joined(chunks), toolRequests: [], done: false };
}

function joined(chunks: readonly string[]): string {
  return chunks.join("\n").trim();
}
