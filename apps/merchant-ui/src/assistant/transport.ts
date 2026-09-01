import { READ_ANSWERS } from "./answers.ts";
import { optionNamed, reoffer } from "./choices.ts";
import { routeIntent } from "./intents.ts";
import { proposeCreate, proposeEdit, resolveChoice } from "./proposals.ts";
import type { Choice, PartialTurn, TurnContext } from "./turn.ts";

/**
 * The seam a server-side merchant agent plugs into.
 *
 * A transport receives the merchant's sentence and the reads already on the
 * page, and returns one turn. That is the entire contract, and it is enough
 * for a model-backed implementation: pick a tool from `MERCHANT_TOOLS`, fill
 * its arguments, and hand back prose plus — for the two `propose` tools — a
 * draft. What a transport can never do is perform one, because performing an
 * inventory change requires a signature this app only ever makes from a key
 * held on the merchant's own device.
 */
export type MerchantTransport = {
  readonly name: string;
  ask(asked: string, context: TurnContext): Promise<PartialTurn>;
  /**
   * Answering a choice the agent offered. A tap names its option outright, so
   * this path interprets nothing — which is the point of offering options
   * rather than a sentence listing them.
   */
  pick(
    optionId: string,
    choice: Choice,
    context: TurnContext,
  ): Promise<PartialTurn>;
};

/** What it can do. Never the greeting — see `TurnContext.pending`. */
function help(): PartialTurn {
  return {
    tool: null,
    said: "I did not follow that. I can tell you why buyers pick you, what they searched for and did not find, or what is on hold — and I can draft a listing change for you to sign.",
    did: [],
    panel: null,
  };
}

function missed(pending: Choice | null): PartialTurn {
  return pending === null
    ? help()
    : reoffer(pending, "I did not follow that. Which of these did you mean?");
}

/** A sentence typed while a choice is open is read as answering it first. */
function fromPending(asked: string, context: TurnContext): PartialTurn | null {
  const { pending } = context;
  if (pending === null) return null;
  const named = optionNamed(pending.options, asked);
  return named === null ? null : resolveChoice(pending, named.id, context);
}

function answer(asked: string, context: TurnContext): PartialTurn {
  const answered = fromPending(asked, context);
  if (answered !== null) return answered;
  const call = routeIntent(asked);
  if (call === null) return missed(context.pending);
  if (call.tool === "listing.propose_create") return proposeCreate(call);
  if (call.tool === "listing.propose_edit")
    return proposeEdit(call, context, asked);
  return READ_ANSWERS[call.tool]?.(context) ?? missed(context.pending);
}

/**
 * The transport that ships. It runs entirely against reads already on the
 * page, which is why every figure it prints is one the merchant can see the
 * provenance of two clicks away, and why it cannot invent one: there is no
 * generator anywhere in this path.
 */
export const localTransport: MerchantTransport = {
  name: "your own ledger",
  ask(asked, context) {
    return Promise.resolve(answer(asked, context));
  },
  pick(optionId, choice, context) {
    return Promise.resolve(resolveChoice(choice, optionId, context));
  },
};
