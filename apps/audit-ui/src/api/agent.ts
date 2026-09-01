// §4.3 — agent-host surface. The conversation itself now runs through
// `conversation/liveTransport.ts` (POST /chat, GET /chat/stream, the two
// signing routes); what is left here is the one preference signal the UI
// raises on its own, outside a run.
import { agentBaseUrl } from "./liveMode.ts";

export type SealFailure = {
  reasonCode: string;
  human: string;
  predicates?: string[];
  /** True when the covenant was signed and only some bounds were refused —
   *  the drafts are spent either way, and holding them would double them. */
  sealed: boolean;
};

/**
 * The Rules screen's hold-to-seal. It lands on agent-host rather than the
 * gateway because `POST /v1/covenant/sign` demands an ES256 signature from the
 * **user** key, and the browser holds no key at all — the hold is the consent,
 * the pinned ring is the authority. Resolves `null` on success, or the reason
 * the covenant was refused; it never resolves silently, because a seal that
 * reports nothing is the bug this route was added to fix.
 */
export async function sealCovenant(body: unknown): Promise<SealFailure | null> {
  const base = agentBaseUrl();
  if (base === null) {
    return {
      sealed: false,
      reasonCode: "NO_AGENT_HOST",
      human: "The agent host is not configured.",
    };
  }
  const response = await fetch(`${base}/covenant/amend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (response === null) {
    return {
      sealed: false,
      reasonCode: "UNREACHABLE",
      human: "The agent host did not answer.",
    };
  }
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) return failureOf(parsed);
  // A 200 is not the same as "all of it took": the write gate refuses a bound
  // that would widen what it is not entitled to widen, and the shopper has to
  // hear which one rather than watch it vanish.
  return refusalOf(parsed);
}

function refusalOf(parsed: unknown): SealFailure | null {
  const body = (parsed ?? {}) as Record<string, unknown>;
  const refused = body["refused"];
  if (!Array.isArray(refused) || refused.length === 0) return null;
  return {
    sealed: true,
    reasonCode: "CONSTRAINT_REFUSED",
    human: `Signed, but ${refused.length === 1 ? "one rule was" : `${refused.length} rules were`} not accepted: a rule may be tightened, never loosened.`,
    predicates: refused.map(String),
  };
}

function failureOf(parsed: unknown): SealFailure {
  const body = (parsed ?? {}) as Record<string, unknown>;
  const predicates = body["predicates"];
  return {
    sealed: false,
    reasonCode: String(body["reason_code"] ?? "PROCESSING_ERROR"),
    human: String(body["human"] ?? "The covenant was not signed."),
    ...(Array.isArray(predicates)
      ? { predicates: predicates.map(String) }
      : {}),
  };
}

/**
 * Tapping an option the agent found on the open web. Unlike a platform pick —
 * which is a choice inside a conversation the host is already holding — this
 * one has to reach the sandbox: the host looks the ref up among the listings it
 * read, navigates the window to that page, and drives the shop's own basket.
 *
 * Only the ref goes on the wire. The card carries the URL for its own copy, but
 * sending it would make a page a client could choose; the host resolves which
 * page `w3` was, exactly as it resolves which SKU a draft named. Resolves false
 * when the host no longer holds that listing, and the caller says so.
 */
export async function pickWebOption(
  optionId: string,
  conversationId: string | null = null,
): Promise<boolean> {
  const base = agentBaseUrl();
  if (base === null) return false;
  const response = await fetch(`${base}/chat/web-pick`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The conversation names the lane whose table holds this ref: another
    // lane's run never read it, so without the id the tap would reach a
    // stranger's listings or none at all.
    body: JSON.stringify({ option_id: optionId, conversation_id: conversationId }),
  }).catch(() => null);
  return response !== null && response.ok;
}

export type SortKeySignal = { sortKey: string; derivedFromMemoryId: string };

/** §2.1 SortKeyBanner — re-sorting locally also ledgers the preference. */
export async function postSortKey(signal: SortKeySignal): Promise<void> {
  const base = agentBaseUrl();
  if (base === null) return;
  await fetch(`${base}/chat/sort-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sort_key: signal.sortKey,
      derived_from_memory_id: signal.derivedFromMemoryId,
    }),
  });
}

/** Deleting a chat also cancels whatever it still had running on the host. */
export async function cancelRun(conversationId: string): Promise<void> {
  const base = agentBaseUrl();
  if (base === null) return;
  await fetch(`${base}/chat/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => undefined);
}
