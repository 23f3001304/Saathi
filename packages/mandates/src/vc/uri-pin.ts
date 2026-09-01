import type { UriPinToPass } from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  PINNED_CONTEXT_URIS,
  W3C_CREDENTIALS_CONTEXT,
} from "@covenant/domain";

import { constantTimeEquals } from "../util/constant-time.js";

export interface UriPinFailure {
  readonly reasonCode: "URI_DOWNGRADE";
  readonly toPass: UriPinToPass;
}

/**
 * AM4 / T-27. Exact match, fail closed: length check then constant-time
 * compare, no prefix match, no `startsWith`, no version parsing, and no
 * fallback profile anywhere in the codebase. "Unknown" and "older" are treated
 * identically on purpose — a misconfigured merchant cannot sell, which is the
 * correct side of the trade in payments (§7.4).
 */
export function checkPinnedUris(
  extensionUri: unknown,
  contexts: readonly unknown[],
  pinned: readonly string[] = PINNED_CONTEXT_URIS,
): UriPinFailure | null {
  const received = typeof extensionUri === "string" ? extensionUri : "";
  if (!constantTimeEquals(received, AP2_EXTENSION_URI)) {
    return failure(received, pinned);
  }
  const first = contexts[0];
  if (
    typeof first !== "string" ||
    !constantTimeEquals(first, W3C_CREDENTIALS_CONTEXT)
  ) {
    return failure(asUri(first), pinned);
  }
  const stray = contexts.find((context) => !isPinned(context, pinned));
  return stray === undefined ? null : failure(asUri(stray), pinned);
}

function isPinned(context: unknown, pinned: readonly string[]): boolean {
  return (
    typeof context === "string" &&
    pinned.some((uri) => constantTimeEquals(context, uri))
  );
}

function asUri(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function failure(received: string, pinned: readonly string[]): UriPinFailure {
  return {
    reasonCode: "URI_DOWNGRADE",
    toPass: {
      expected_uri: AP2_EXTENSION_URI,
      received_uri: received,
      pinned_contexts: pinned,
      remedy: "upgrade_extension_uri",
    },
  };
}
