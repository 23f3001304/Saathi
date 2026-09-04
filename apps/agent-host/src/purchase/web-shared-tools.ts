import type { JsonSchemaObject, ToolDeclaration } from "@covenant/agents";
import {
  SEE_CARDS_TOOL,
  SEE_PROFILE_TOOL, APP_STATE_TOOL, ASK_SHOPPER_TOOL, WEB_TOOL_SERVER } from "@covenant/agents";
import { askedBudget, MAX_AXES } from "@covenant/agents";
import { z } from "zod";

function schemaOf(shape: z.ZodRawShape): JsonSchemaObject {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

/** The two moves every errand has, whichever surface it is on: see where
 *  things stand, and ask the person. Declared once so the buy surface and
 *  the research surface cannot drift apart on them. */
export const SHARED_TOOL_DECLARATIONS: readonly ToolDeclaration[] = [
  {
    tool: SEE_CARDS_TOOL,
    server: WEB_TOOL_SERVER,
    // Host-held facts, read and not recorded: nothing in the turn can change
    // what this returns, so two of these are the same as one.
    concurrency: "parallel",
    description:
      "Look at the cards the shopper has on screen right now, with the ref " +
      "that names each one. Call it before you talk about what you showed " +
      "them, or when they mention one and you need to know which.",
    parameters: schemaOf({}),
  },
  {
    tool: SEE_PROFILE_TOOL,
    server: WEB_TOOL_SERVER,
    // Host-held facts, read and not recorded: nothing in the turn can change
    // what this returns, so two of these are the same as one.
    concurrency: "parallel",
    description:
      "Look at what this app knows about the shopper: the delivery facts " +
      "they themselves gave it. web_fill_address types exactly these and " +
      "nothing else, so read this before deciding whether a form can be " +
      "filled, and ask them for anything missing rather than inventing it. " +
      "Passwords are never here; app_state says whether one is stored.",
    parameters: schemaOf({}),
  },
  {
    tool: ASK_SHOPPER_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "Ask the shopper something and stop until they answer. This is the " +
      "ONLY way to ask: a question mark in your prose is prose, and reaches " +
      "them as a sentence nobody can answer. Give `replies` for a single " +
      "choice, or `groups` for a compound one (one group per axis you ask " +
      "about, and every axis you name needs its group). The axes to name are " +
      "the ones two otherwise-matching candidates would differ on for THIS " +
      "thing - what would hand someone the wrong one if you guessed it. Ask " +
      "everything you need in one call, and only for what looking cannot " +
      "tell you. Budget is not a group: it has its own field.",
    parameters: schemaOf({
      question: z.string().min(1).max(300),
      replies: z.array(z.string().min(1).max(60)).max(6).default([]),
      groups: z
        .array(
          z.object({
            label: z.string().min(1).max(24),
            options: z.array(z.string().min(1).max(40)).min(2).max(5),
          }),
        )
        .max(MAX_AXES)
        .default([]),
      budget: askedBudget.nullable(),
    }),
  },
  {
    tool: APP_STATE_TOOL,
    server: WEB_TOOL_SERVER,
    // Host-held facts, read and not recorded: nothing in the turn can change
    // what this returns, so two of these are the same as one.
    concurrency: "parallel",
    description:
      "See where things actually stand right now: whether a window is open " +
      "and who is driving it, whether a covenant is signed and its ceiling, " +
      "how many cards are on the shopper's screen, whether a basket or a " +
      "delivery form has been seen, whether a checkout is parked, and " +
      "whether a sign-in is stored for this shop (whether, never what). " +
      "Call it whenever you are unsure what has already happened, rather " +
      "than assuming or asking the shopper to repeat themselves.",
    parameters: schemaOf({}),
  },
];
