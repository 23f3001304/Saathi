import { z } from "zod";

/**
 * The budget axis, and the reason it is not just another `choice_groups` entry.
 *
 * DECISION: every band names a ceiling, as a number, in the schema. A group's
 * options are free strings, and given free strings a model asks "what is the
 * most you want to spend" and offers "Over ₹20,000" as its top band - which
 * cannot answer that question. Observed six times in a row across two reasoning
 * efforts: the shopper picks it, the agent still has no ceiling, and it asks
 * again. The prompt already forbade the second question in two places and that
 * did not hold, because prose cannot make a shape unwriteable and a schema can.
 * With `strict: true` on the wire, `ceiling_paise` is required, so an
 * open-ended band no longer parses.
 *
 * The number's work is done at the boundary. Downstream this becomes an
 * ordinary labelled group, so the transcript, the composer and the beat all
 * keep the shape they had.
 */
export const askedBudget = z
  .object({
    label: z.string().min(1).max(24),
    bands: z
      .array(
        z.object({
          text: z.string().min(1).max(40),
          ceiling_paise: z.number().int().positive(),
        }),
      )
      .min(2)
      .max(5),
  })
  .nullable()
  .describe(
    "The budget axis, when you need one, and `null` when you do not. " +
      "Every band names the most it covers, in paise, because you " +
      "asked for the MOST they will spend and a band with no top " +
      "cannot answer that: offered one, they answer, you still have " +
      "no ceiling, and you ask again - which is the one question too " +
      "many. So there is no open-ended band here. Three or four you " +
      "judge sensible for this product class, the last one topping " +
      "out where this class realistically does; the text box beside " +
      "the groups still takes an exact figure.",
  );
