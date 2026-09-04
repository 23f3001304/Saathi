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

/** Viewport pixels, up or down. Bounded because it reaches Chrome's input
 *  pipeline: a scroll nobody could perform by hand is not a look. */
export const webScrollArgs = z.object({
  dy: z.number().int().min(-2000).max(2000),
});

/** What a research errand reports: candidates as the source printed them.
 *  Every row is untrusted text and the host re-parses the price itself. */
/** The mouse: a point to click, or a distance to scroll. */
export const mouseArgs = z
  .object({
    do: z.enum(["click", "scroll"]),
    x: z.number().int().min(0).optional(),
    y: z.number().int().min(0).optional(),
    by: z.number().int().optional(),
  })
  .refine(
    (move) =>
      move.do === "scroll"
        ? move.by !== undefined
        : move.x !== undefined && move.y !== undefined,
    { message: "click needs x and y; scroll needs by" },
  );

/** The keyboard: characters, or one named key. Exactly one of them. */
export const keyboardArgs = z
  .object({
    type: z.string().min(1).max(300).optional(),
    press: z.string().min(1).max(20).optional(),
  })
  .refine((move) => (move.type === undefined) !== (move.press === undefined), {
    message: "give exactly one of type or press",
  });

export const askShopperArgs = z.object({
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
});

export const webVerifyArgs = z.object({
  urls: z.array(z.url()).min(1).max(6),
});

/** One product the model read on a page this host verified: the page's own
 *  title for it and the price it printed, copied out. Both are checked
 *  verbatim against that read before a ref exists. */
const webCardRow = z.object({
  url: z.url(),
  title: z.string().min(1).max(500),
  price_text: z.string().min(1).max(300),
  image_url: z.url().nullable().default(null),
});

export const webCardArgs = z.object({
  rows: z.array(webCardRow).min(1).max(6),
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
export type WebCardArgs = z.infer<typeof webCardArgs>;

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
export { WEB_TOOL_DECLARATIONS } from "./web-buy-tools.js";
export { RESEARCH_TOOL_DECLARATIONS } from "./web-research-tools.js";
