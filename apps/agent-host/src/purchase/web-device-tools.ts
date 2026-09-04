import type { JsonSchemaObject, ToolDeclaration } from "@covenant/agents";
import { KEYBOARD_TOOL, MOUSE_TOOL, WEB_TOOL_SERVER } from "@covenant/agents";
import { z } from "zod";

function schemaOf(shape: z.ZodRawShape): JsonSchemaObject {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

/**
 * The two devices. A person shopping uses a mouse and a keyboard, and so
 * does the agent: it looks at the window through `web_glance`, reads the
 * point it wants off the coordinate grid, and sends the pointer there. No
 * selector, no DOM path, nothing that a canvas or a shadow root can hide
 * from. Aim is free precisely because aim is not permission: every click
 * still resolves through the hit-test and the same classifier.
 */
export const DEVICE_TOOL_DECLARATIONS: readonly ToolDeclaration[] = [
  {
    tool: MOUSE_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "The sandbox's mouse. `click` at a point you read off web_glance's " +
      "grid, or `scroll` by a number of pixels (negative goes up). Only " +
      "points inside the window can be clicked, so scroll a control into " +
      "view before aiming at it. Every move answers with a fresh picture of " +
      "the window. A click on a control that commits money or an account is " +
      "refused, whatever it is aimed at.",
    // Nullable rather than optional, because strict mode requires every
    // property and a field the model may omit is one it will omit. `null` is
    // the honest way to say "not this kind of move": a scroll sends x and y as
    // null, a click sends by as null, and `mouseArgs` reads either as absent.
    parameters: schemaOf({
      do: z.enum(["click", "scroll"]),
      x: z.number().int().min(0).nullable(),
      y: z.number().int().min(0).nullable(),
      by: z.number().int().nullable(),
    }),
  },
  {
    tool: KEYBOARD_TOOL,
    server: WEB_TOOL_SERVER,
    description:
      "The sandbox's keyboard, typing wherever your last click put the " +
      "cursor: `type` for characters, or `press` for one named key such as " +
      "Enter, Tab or Escape. Click the box first. Passwords are never typed " +
      "this way; web_sign_in does that without showing you anything.",
    parameters: schemaOf({
      type: z.string().min(1).max(300).nullable(),
      press: z.string().min(1).max(20).nullable(),
    }),
  },
];
