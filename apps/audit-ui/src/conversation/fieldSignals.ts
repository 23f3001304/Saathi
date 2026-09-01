// The half of the fold that only sets fields: nothing here touches the entry
// list, which is what keeps the transcript's shape in one file and the run's
// state in another.
import type { AssistantSnapshot } from "./assistantSnapshot.ts";
import type { AssistantSignal, SignScope } from "./assistantTransport.ts";

function released(
  state: AssistantSnapshot,
  scope: SignScope,
): SignScope | null {
  return state.awaiting === scope ? null : state.awaiting;
}

/** The money fields, split out to keep each switch inside the complexity
 *  budget: what a signature is bounded by, what it would release, and what
 *  it settled into are one family of facts. */
function applyMoneySignal(
  state: AssistantSnapshot,
  signal: AssistantSignal,
): AssistantSnapshot | null {
  switch (signal.kind) {
    case "covenant":
      return {
        ...state,
        covenant: { capPaise: signal.capPaise, thumbprint: signal.thumbprint },
      };
    case "cart-built":
      return {
        ...state,
        cart: { totalPaise: signal.totalPaise, itemCount: signal.itemCount },
      };
    case "settlement":
      return { ...state, txnId: signal.txnId };
    default:
      return null;
  }
}

/** Signals that only set a field; none of them touch the entry list. */
export function applyFieldSignal(
  state: AssistantSnapshot,
  signal: AssistantSignal,
): AssistantSnapshot {
  const money = applyMoneySignal(state, signal);
  if (money !== null) return money;
  switch (signal.kind) {
    case "sandbox":
      return { ...state, sandbox: signal.session };
    case "await-sign":
      return { ...state, awaiting: signal.scope };
    case "signed":
      return { ...state, awaiting: released(state, signal.scope) };
    case "status":
      return { ...state, status: signal.status, notice: signal.detail };
    case "run-idle":
      return { ...state, running: false };
    default:
      return state;
  }
}

