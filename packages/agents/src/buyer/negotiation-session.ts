import type { AgentSession } from "../shared/agent-session.js";
import type {
  NegotiationEvent,
  NegotiationPolicy,
  NegotiationState,
  QuoteOffer,
} from "./negotiation-machine.js";
import {
  initialNegotiation,
  isTerminal,
  negotiationStep,
} from "./negotiation-machine.js";

/** Where a price comes from. In the demo, the merchant agent's `QuoteTool`. */
export interface QuoteSource {
  requestQuote(sku: string, targetPaise: number): Promise<QuoteOffer | null>;
}

const MOVE_PROMPT =
  "Reply with one JSON object and nothing else: " +
  '{"move":"accept"} or {"move":"counter","target_paise":<int>} or {"move":"walk_away","reason":"<short>"}.';

function readJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * An unreadable move walks away rather than defaulting to accept. The model is
 * an advisor here; when the advice is unintelligible the machine stops, because
 * the alternative is spending money on a parse failure.
 */
export function parseMove(text: string): NegotiationEvent {
  const parsed = readJson(text);
  const move = parsed?.["move"];
  const target = parsed?.["target_paise"];
  if (move === "accept") {
    return { kind: "accept" };
  }
  if (move === "counter" && typeof target === "number") {
    return { kind: "counter", targetPaise: Math.trunc(target) };
  }
  const reason = parsed?.["reason"];
  return {
    kind: "walk_away",
    reason: typeof reason === "string" ? reason : "unreadable_move",
  };
}

export interface NegotiationRequest {
  readonly sku: string;
  readonly openingTargetPaise: number;
}

/**
 * Runs quote → advise → step until the machine reaches a terminal phase. The
 * model chooses moves; the machine decides which of them are legal, which is
 * why an intent cap holds even when the prompt is talked into ignoring it.
 */
export class NegotiationSession {
  constructor(
    private readonly session: AgentSession,
    private readonly quotes: QuoteSource,
    private readonly policy: NegotiationPolicy,
  ) {}

  async run(request: NegotiationRequest): Promise<NegotiationState> {
    let state = initialNegotiation(this.policy, request.openingTargetPaise);
    while (!isTerminal(state) && state.round <= this.policy.maxRounds) {
      state = await this.quoteInto(state, request.sku);
      if (isTerminal(state)) {
        break;
      }
      state = negotiationStep(state, await this.advise(state), this.policy);
    }
    return state;
  }

  private async quoteInto(
    state: NegotiationState,
    sku: string,
  ): Promise<NegotiationState> {
    const offer = await this.quotes.requestQuote(sku, state.targetPaise);
    if (offer === null) {
      return negotiationStep(
        state,
        { kind: "walk_away", reason: "no_quote" },
        this.policy,
      );
    }
    return negotiationStep(state, { kind: "quote", offer }, this.policy);
  }

  private async advise(state: NegotiationState): Promise<NegotiationEvent> {
    const turn = await this.session.turn({
      userMessage: [
        `round=${state.round} cap_paise=${this.policy.capPaise}`,
        `target_paise=${state.targetPaise} best_paise=${state.best?.totalPaise ?? "none"}`,
        MOVE_PROMPT,
      ].join("\n"),
      toolResults: [],
    });
    return parseMove(turn.text);
  }
}
