import type { SessionHandle } from "../browser/browser-registry.js";
import {
  NotYourTurnError,
  NotYourWindowError,
} from "../browser/browser-service.js";
import { relayRequest } from "../browser/relay-input.js";
import type { AppContext } from "./app-env.js";
import { BROWSER_SESSION_HEADER } from "./browser-key.js";

/**
 * The one route that reaches the page. Every call through it is re-judged by
 * the same classifier the agent is blocked by, and the failure modes of a page
 * mid-swap are absorbed here rather than surfaced as processing errors.
 */

/**
 * The window this caller thinks it is driving. The path already names a
 * session, so this is the second, older half of the same question: which
 * *container* that session is on now. A call carrying none is left alone; one
 * naming a window that has since been replaced is refused rather than quietly
 * re-aimed at whatever is open under that id today.
 */
function askedSession(context: AppContext): string | null {
  const header = context.req.header(BROWSER_SESSION_HEADER);
  return header === undefined || header === "" ? null : header;
}

/** The page swapping processes under a click closes the CDP connection the
 *  relay was riding; the input threw, the route 500'd, and the person saw a
 *  processing error for pressing a button during a redirect. A swap settles
 *  in a few hundred milliseconds, so one quiet retry usually lands it. */
const SWAP_ERROR =
  /connection closed|target closed|session closed|detached|internal error|execution context/i;
const SWAP_RETRY_MS = 300;

export async function input(
  context: AppContext,
  handle: SessionHandle,
): Promise<Response> {
  const parsed = relayRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  try {
    handle.service.assertBoundTo(askedSession(context));
    // A refusal is the system working, so it is a 200 with `ok: false` — the
    // same shape the rest of this host uses for a rejected write.
    return context.json(await handle.service.relay(parsed.data), 200);
  } catch (cause) {
    if (cause instanceof Error && SWAP_ERROR.test(cause.message)) {
      await new Promise((resolve) => setTimeout(resolve, SWAP_RETRY_MS));
      try {
        return context.json(await handle.service.relay(parsed.data), 200);
      } catch {
        return context.json(
          {
            ok: false,
            reason_code: "PAGE_CHANGING",
            human:
              "The page is changing under that click. Give it a second " +
              "and try again.",
          },
          200,
        );
      }
    }
    return refusal(context, cause);
  }
}

function refusal(context: AppContext, cause: unknown): Response {
  if (cause instanceof NotYourWindowError) {
    return context.json(
      { ok: false, reason_code: "NOT_YOUR_WINDOW", human: cause.message },
      409,
    );
  }
  if (cause instanceof NotYourTurnError) {
    return context.json(
      { ok: false, reason_code: "NOT_YOUR_TURN", human: cause.message },
      409,
    );
  }
  throw cause;
}

