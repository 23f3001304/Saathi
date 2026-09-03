import { z } from "zod";

export const webOpenArgs = z.object({ url: z.url() });

export const webSearchArgs = z.object({ query: z.string().min(1).max(200) });

/** A ref from the last `web_read`, never a selector. See `PageRefs`. */
export const webRefArgs = z.object({ ref: z.string().regex(/^c[0-9]{1,3}$/) });

/** Viewport pixels, from a control's own `at` in the last read. */
const point = { x: z.number().int().min(0), y: z.number().int().min(0) };
export const webPressArgs = z.object(point);
export const webWriteArgs = z.object({
  ...point,
  text: z.string().min(1).max(300),
});

/** What a research errand reports: candidates as the source printed them.
 *  Every row is untrusted text and the host re-parses the price itself. */
export const webVerifyArgs = z.object({
  urls: z.array(z.url()).min(1).max(6),
});

export const webEnterCodeArgs = z.object({
  code: z.string().regex(/^[0-9]{4,10}$/),
});

/** Giving the window back. The reason is a closed list because it maps to
 *  `HandoffReason`, which is closed for the same reason; `why` is the model's
 *  own sentence and the only thing about this move it writes. */
export const webHandoverArgs = z.object({
  reason: z.enum(["payment", "sign-in", "human-check", "other"]),
  why: z.string().min(1).max(300),
});

export const webFoundArgs = z.object({
  found: z
    .array(
      z.object({
        // Generous caps, trimmed at the record: a model that wrote a long
        // title or annotated a price has still found a real listing, and
        // refusing the whole report over string length threw away a live
        // errand's work. The card shows the head of each string.
        title: z.string().min(1).max(500),
        price_text: z.string().max(300),
        url: z.url(),
        image_url: z.url().nullable().default(null),
      }),
    )
    .min(1)
    .max(8),
});

export type WebOpenArgs = z.infer<typeof webOpenArgs>;
export type WebSearchArgs = z.infer<typeof webSearchArgs>;
export type WebRefArgs = z.infer<typeof webRefArgs>;
export type WebPressArgs = z.infer<typeof webPressArgs>;
export type WebWriteArgs = z.infer<typeof webWriteArgs>;
export type WebFoundArgs = z.infer<typeof webFoundArgs>;

/**
 * The sandbox as a tool surface.
 *
 * DECISION (supersedes "no general click tool"): every press is expressible,
 * and every press is judged. The aim is a point from the last read's own
 * boxes; the hit-test resolves what is under it and `FieldClassifier` judges
 * that, exactly as it judges the ref path and the human relay. A point on
 * nothing readable, or inside an embedded document, is refused outright — so
 * "the agent never presses Place order" still lives in the classifier, which
 * now also covers controls the reader could not name.
 *
 * These are declared to the model exactly like the merchant and gateway tools,
 * on their own server name, so `PreToolUseHook` judges them on the same
 * `(tool, server)` pair as everything else and the block matrix is unchanged.
 */
export {
  RESEARCH_TOOL_DECLARATIONS,
  WEB_TOOL_DECLARATIONS,
} from "./web-buy-tools.js";
