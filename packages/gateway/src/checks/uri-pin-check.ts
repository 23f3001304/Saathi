import type { Verdict } from "@covenant/domain";
import { fail, pass } from "@covenant/domain";
import { checkPinnedUris } from "@covenant/mandates";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";

/**
 * AM4 / T-27. Constant-time exact match of the AP2 extension URI and of every
 * `@context` entry against the pin set — length check, then
 * `crypto.timingSafeEqual` on equal-length buffers. No prefix match, no
 * `startsWith`, no version parsing, and **no fallback profile exists in the
 * codebase**: "unknown" and "older" are treated identically on purpose.
 *
 * The comparison itself is `mandates/vc/uri-pin`, imported rather than
 * re-implemented — a second copy of a security predicate is a second chance to
 * get it wrong, and the pin set is data this check reads from the context.
 */
export class UriPinCheck implements VerdictCheck {
  readonly id = "uri_pin" as const;

  run(context: VerdictContext): Verdict {
    const failure = checkPinnedUris(
      context.cart.ap2_extension_uri,
      context.cartContexts,
      context.pinnedUris,
    );
    return failure === null
      ? pass(this.id)
      : fail(this.id, failure.reasonCode, failure.toPass);
  }
}
