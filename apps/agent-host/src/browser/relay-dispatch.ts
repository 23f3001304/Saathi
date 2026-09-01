import type {
  ActionResult,
  BrowserSession,
  HandoffTarget,
  Refusal,
  UserInput,
} from "@covenant/browser-drive";
import { RelayViolation } from "@covenant/browser-drive";

import { NotYourTurnError } from "./browser-errors.js";
import type { RelayRequest, RelayResponse } from "./relay-input.js";

/**
 * The whole translation from wire to window: four verbs, no selectors, no
 * element ids. A caller can say "click at 412,208" and nothing else — which is
 * why `UserInput` is able to read the target itself before letting it through.
 */
export function relayOn(
  input: UserInput,
  request: RelayRequest,
): Promise<ActionResult<null>> {
  switch (request.kind) {
    case "click":
      return input.click(request.x, request.y);
    case "type":
      return input.type(request.text);
    case "key":
      return input.key(request.name);
    case "scroll":
      return input.scroll(request.dy);
  }
}

/**
 * One relayed action, end to end.
 *
 * `RelayViolation` becomes a 409 rather than escaping: the throw is the
 * invariant — the user's input is only accepted while the user is driving —
 * and the status code is the manners. A refusal from the classifier is
 * different and is *not* an error: it comes back as a body, because a refusal
 * is the system working.
 */
export async function relayInto(
  session: BrowserSession,
  request: RelayRequest,
  handToUser: () => Promise<HandoffTarget | null>,
): Promise<RelayResponse> {
  try {
    return await settleRelay(
      await relayOn(session.input(), request),
      handToUser,
    );
  } catch (cause) {
    if (cause instanceof RelayViolation) {
      throw new NotYourTurnError(session.currentState());
    }
    throw cause;
  }
}

/**
 * A refusal with a category is the classifier saying "this one is yours".
 *
 * What "yours" means depends on where the window is, and the session answers
 * that rather than this file guessing: on the native surface the real Chrome
 * window is raised first, so the sentence the UI shows — "it just came to the
 * front" — is already true when it arrives; in a container there is no window
 * to raise and the honest answer is the URL, to open in the browser on the
 * user's own machine.
 */
export async function settleRelay(
  result: ActionResult<null>,
  handToUser: () => Promise<HandoffTarget | null>,
): Promise<RelayResponse> {
  if (result.ok) return { ok: true };
  const yours = result.category !== null;
  return {
    ...refusalBody(result),
    hand_off_natively: yours,
    ...whereToGo(yours ? await handToUser() : null),
  };
}

function whereToGo(target: HandoffTarget | null): {
  native_entry: string | null;
  fronted: boolean;
  surface: "native-window" | "container" | null;
  open_url: string | null;
} {
  if (target === null) {
    return {
      native_entry: null,
      fronted: false,
      surface: null,
      open_url: null,
    };
  }
  return {
    native_entry: target.sentence,
    fronted: target.fronted,
    surface: target.surface,
    // A raised window is the destination; otherwise the destination is a URL.
    open_url: target.fronted ? null : target.url,
  };
}

function refusalBody(refusal: Refusal): {
  ok: false;
  reason: string;
  rule: string;
  category: string | null;
  human: string;
} {
  return {
    ok: false,
    reason: refusal.reason,
    rule: refusal.rule,
    category: refusal.category,
    human: refusal.human,
  };
}
