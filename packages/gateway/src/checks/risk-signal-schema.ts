import { z } from "zod";

/**
 * AM5. The ACP `{type, score, action}` triple, schema-**exact**: `strictObject`
 * makes an unknown key a rejection rather than a field to ignore, and the score
 * range is part of the schema, not a later assertion. Parameter poisoning works
 * by adding a key nobody validates, so there is no `passthrough` anywhere on
 * this path.
 */
export const riskSignalSchema = z.strictObject({
  type: z.string().min(1),
  score: z.number().min(0).max(1),
  action: z.enum(["blocked", "manual_review", "authorized"]),
});

export const riskSignalsSchema = z.array(riskSignalSchema);

/** `signals[2].score` — enough for the agent to fix exactly one field. */
export function offendingFields(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) =>
    issue.path.length === 0 ? "signals" : `signals.${issue.path.join(".")}`,
  );
}
