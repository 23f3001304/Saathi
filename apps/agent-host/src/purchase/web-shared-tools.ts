import type { JsonSchemaObject, ToolDeclaration } from "@covenant/agents";
import { APP_STATE_TOOL, ASK_SHOPPER_TOOL, WEB_TOOL_SERVER } from "@covenant/agents";
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
    tool: ASK_SHOPPER_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "Ask the shopper something and stop until they answer. This is the " +
      "ONLY way to ask: a question mark in your prose is prose, and reaches " +
      "them as a sentence nobody can answer. Give `replies` for a single " +
      "choice, or `groups` for a compound one (one group per axis you ask " +
      "about, and every axis you name needs its group). Ask everything you " +
      "need in one call, and only for what looking cannot tell you.",
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
        .max(4)
        .default([]),
    }),
  },
  {
    tool: APP_STATE_TOOL,
    server: WEB_TOOL_SERVER,
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
