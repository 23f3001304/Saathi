import { z } from "zod";

import type {
  JsonSchemaObject,
  ToolDeclaration,
} from "../providers/tool-declarations.js";
import { BUYER_TOOL_SERVER } from "./turn-plan.js";

/** Providers take a bare JSON Schema object; `$schema` is not part of it. */
function schemaOf(shape: z.ZodRawShape): JsonSchemaObject {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

/** The WHOLE of what the agent says this turn. Shared by the files that
 *  declare moves, so a move split into its own file cannot drift on it. */
export const replyText = z.string().min(1).max(600);

/** One of the buyer's own tools, on the buyer's own server: a move or a
 *  read alike. Shared so the two files declaring them cannot drift on the
 *  server name, which is the half of the pair the hook judges on. */
export function declareTool(
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
