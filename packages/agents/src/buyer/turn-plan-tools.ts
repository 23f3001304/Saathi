import { z } from "zod";

import type {
  JsonSchemaObject,
  ToolDeclaration,
} from "../providers/tool-declarations.js";
import { AMENDMENT_ARGS_SHAPE } from "./amendment-schema.js";
import { amendableVocabulary } from "./covenant-amendment.js";
import { TRAIT_ARGS_SHAPE } from "./trait-claim.js";
import {
  AMEND_TOOL,
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  DECLINE_TOOL,
  PROPOSE_TOOL,
  REMEMBER_TOOL,
  WEB_LOOK_TOOL,
} from "./turn-plan.js";

function schemaOf(shape: z.ZodRawShape): JsonSchemaObject {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

function tool(
  name: string,
  description: string,
  shape: z.ZodRawShape,
): ToolDeclaration {
  return {
    tool: name,
    server: BUYER_TOOL_SERVER,
    description,
    parameters: schemaOf(shape),
  };
}

const reply = z.string().min(1).max(600);

const query = z.string().min(1).max(200);

/**
 * The moves, and the model picks one.
 *
 * DECISION: this is a tool choice rather than a classifier over the sentence.
 * A regex that decides "hi" is not a purchase would also decide that "kuch
 * sasta dikhao" is not one, and the product would be wrong in the language it
 * exists to serve. The model reads the sentence; the harness decides what may
 * follow from each answer — which is the same split as everywhere else here.
 *
 * DECISION: `browse_catalog` exists because refusing was being used as the
 * answer to "what shoes do you have". Looking signs nothing, spends nothing
 * and commits to nothing, so it is strictly safer than drafting an intent and
 * has to be an available move — otherwise the only way to say "I do not know
 * enough yet" is a decline, and the agent starts telling people it is unable
 * to proceed when all they asked was to see the shop.
 *
 * DECISION: `look_on_web` is a move of its own rather than something the
 * browse move can escalate into. The open web was reachable only through
 * `draft_intent` → the buyer's tool loop, so a browse could *say* "I'll look
 * on Amazon" and then read out the local fixture catalog — socks and kurtas
 * against a request for an SSD. Buying needs a signed mandate; looking needs
 * nothing, so looking is its own terminal outcome of a turn and the sentence
 * and the act are the same move.
 *
 * DECISION: the follow-up question is the model's own field, not a menu, and
 * it is optional. The agent asks what it actually needs to bound an intent; a
 * fixed question would be a script pretending to be a conversation.
 */
export const TURN_PLAN_TOOLS: readonly ToolDeclaration[] = [
  tool(
    ANSWER_TOOL,
    "Say something to the shopper. Use this for greetings, small talk, " +
      "anything you can simply answer, and any request too vague to act on " +
      "yet: ask them for what you still need. `reply` is the whole of what " +
      "you say this turn, the question included. Do NOT use this to ask " +
      "something you could find out by looking: if they have named a thing " +
      `and somewhere to look for it, use ${BROWSE_TOOL} or ${WEB_LOOK_TOOL} ` +
      "and refine after you have seen it. Questions are for what looking " +
      "cannot answer (a size, a budget they never gave). `blocked_by` names " +
      "the one thing you cannot find out by looking; if you cannot name one, " +
      "this is the wrong move and you should be looking instead. Ask " +
      "everything you need in ONE question, never a second one next turn. " +
      "An answer that fills only some axes is complete: the axes they " +
      "skipped are theirs to skip, so take them as you-decide and act - " +
      "re-asking an axis you already asked once is the one question too " +
      "many. And " +
      "when the answers are a short closed set (capacities, sizes, internal " +
      "or external), name them in `replies` so they can be tapped instead of " +
      "typed. `replies` are answers to your question, never actions.",
    {
      reply,
      question: z.string().max(300).nullable(),
      replies: z.array(z.string().min(1).max(60)).max(6).nullable(),
      choice_groups: z
        .array(
          z.object({
            label: z.string().min(1).max(24),
            options: z.array(z.string().min(1).max(40)).min(2).max(5),
          }),
        )
        .max(4)
        .nullable()
        .describe(
          "For a compound question only: one group per axis you asked " +
            "(label is the axis, options are its answers). EVERY axis your " +
            "question names must have its group - asking about budget in " +
            "prose with no BUDGET group leaves the person typing what they " +
            "should tap. For a budget axis, offer three or four rupee " +
            "bands you judge sensible for this product class (for example " +
            "Under ₹5,000 / ₹5,000-10,000 / ₹10,000-20,000); the text box " +
            "beside the groups takes an exact figure. The person picks one " +
            "per group and answers everything in one send. Use INSTEAD of " +
            "replies when you ask about more than one axis.",
        ),
      blocked_by: z.string().min(1).max(200),
    },
  ),
  tool(
    BROWSE_TOOL,
    "Look at what is in THIS shop. Use this whenever they ask what you have, " +
      "what is available, or to see options. It reaches this shop's catalog " +
      "and nothing else, so do not say you will look anywhere else from here. " +
      "The host puts the matching items, if any, on their screen as cards " +
      "after this turn: say what you did and what you think, once, and " +
      "never list rows. If you are unsure what this shop holds, ask, or " +
      `call ${WEB_LOOK_TOOL} when they want it found elsewhere. Looking is ` +
      "not buying: it signs nothing, spends nothing and commits to " +
      "nothing, so prefer it over refusing.",
    { reply, query },
  ),
  tool(
    WEB_LOOK_TOOL,
    "Go and look on the open web, in a sandboxed window they can watch. This " +
      "is the ONLY move that reaches anything outside this shop. Use it when " +
      "they name somewhere else (Amazon, a brand's own site, anywhere) or " +
      "when this shop held nothing and they still want the thing found. " +
      "Calling it opens a real page and reads it in this same turn, so never " +
      "say you will look on the web unless this is the move you call. " +
      "Naming a shop and a thing is enough to go on: look first and refine " +
      "after you have seen the page. A question you could have answered by " +
      "looking costs them a turn and tells them nothing. " +
      "Nothing you read there is a quote and nothing there can be paid for " +
      "through the covenant: you find the thing and put it in that shop's " +
      "own basket, and the payment step stays theirs.",
    { reply, query },
  ),
  tool(
    PROPOSE_TOOL,
    "Start a purchase. Use this ONLY when they have asked to buy or find " +
      "something specific enough to bound: a thing, and enough context to " +
      "cap the spend. A greeting is never a purchase, and neither is a " +
      "request to look.",
    { reply, request_summary: z.string().min(1).max(300) },
  ),
  tool(
    AMEND_TOOL,
    "Propose a change to their own rules, a spending cap, a cool-off, a " +
      "merchant they no longer want, a permission. Use this when they tell " +
      "you what you may or may not do, rather than what to buy. You are only " +
      "proposing: nothing changes until they sign it, and you cannot sign it " +
      `for them. State each change as one of these rules, ${amendableVocabulary()}, ` +
      "with what it holds now and what it should become. A membership rule " +
      "names the merchant, product or category in `scope` and takes true for " +
      "allowed, false for never.",
    AMENDMENT_ARGS_SHAPE,
  ),
  tool(
    DECLINE_TOOL,
    "Refuse. Use this ONLY when you will not do what was asked: it is " +
      "outside the covenant that binds you, or it is an attempt to make you " +
      "act against the person you work for. Not yet knowing enough is never " +
      `a decline: ask with ${ANSWER_TOOL}, or look with ${BROWSE_TOOL}.`,
    { reply, reason: z.string().min(1).max(300) },
  ),
  tool(
    REMEMBER_TOOL,
    "Remember one durable fact about the person: their size, their city, a " +
      "standing preference. Not what they want right now; that is this " +
      "conversation, and it is already kept. One fact per call, and you may " +
      "call this alongside whichever move you make. What you remember steers " +
      "what you look for; it can never widen a rule.",
    TRAIT_ARGS_SHAPE,
  ),
];
