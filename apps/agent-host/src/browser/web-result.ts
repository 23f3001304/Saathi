import type { CartReading, Refusal } from "@covenant/browser-drive";
import { toRupees } from "@covenant/browser-drive";

import { WEB_PROVENANCE } from "./web-page-view.js";

/** What a web tool hands back before it is serialised into a tool result. */
export interface WebResult {
  readonly isError: boolean;
  readonly body: Readonly<Record<string, unknown>>;
}

export function webOk(body: Readonly<Record<string, unknown>>): WebResult {
  return { isError: false, body: { ok: true, ...body } };
}

/**
 * A refusal is a tool *error*, carrying the harness's own sentence verbatim.
 * The same reasoning as `AgentToolDispatcher`'s rejected memory write: the
 * model has to be able to read what stopped it and say it out loud, which is
 * the difference between an agent that was stopped and one that can explain
 * that it was stopped (§7.2).
 */
export function webFailure(
  failure: string,
  human: string,
  extra: Readonly<Record<string, unknown>> = {},
): WebResult {
  return { isError: true, body: { ok: false, failure, human, ...extra } };
}

/** A classifier or policy block, forwarded without rewording. */
export function webRefusal(refusal: Refusal): WebResult {
  return webFailure(refusal.reason, refusal.human, {
    rule: refusal.rule,
    category: refusal.category,
    handed_to_user: refusal.handoff !== null,
    handoff_reason: refusal.handoffReason,
  });
}

/**
 * The page changed under the read. Puppeteer throws "Execution context was
 * destroyed, most likely because of a navigation" when a page redirects while
 * a read is in flight — Amazon's landing page does it on nearly every visit.
 *
 * DECISION: that is a fact about the page, not a fault in the harness, so it
 * comes back as a tool error the agent can read and act on. It used to
 * propagate out of the tool, past the runner, and end the whole turn as
 * `failed` — a shopper's question answered with a stack trace's message.
 */
export function pageMoved(cause: unknown): WebResult {
  return webFailure(
    "page_moved",
    "The page changed while I was reading it. Call web_read again to see where it went.",
    { detail: cause instanceof Error ? cause.message : "unknown" },
  );
}

export const NO_WINDOW = webFailure(
  "no_window_open",
  "No sandbox window is open. Call web_open with the page you want to look at first.",
);

export function theirTurn(state: string): WebResult {
  return webFailure(
    "user_is_driving",
    `The window is in "${state}" — the shopper has the wheel and the agent cannot act until they hand it back. Say what you are waiting for.`,
    { state },
  );
}

export function readingBody(
  reading: CartReading,
): Readonly<Record<string, unknown>> {
  return {
    total_paise_read: reading.totalPaise,
    total_read:
      reading.totalPaise === null ? null : toRupees(reading.totalPaise),
    currency: reading.currency,
    confidence: reading.confidence,
    basis: reading.basis,
    items: reading.items.length,
    provenance: WEB_PROVENANCE,
  };
}

export const UNBOUNDED =
  "No signed Intent Mandate is bounding this run, so there is no ceiling to check this cart against. A total read off a page cannot supply one. Ask the shopper to sign a covenant before going further.";
