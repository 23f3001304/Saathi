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

/** Signals that only set a field; none of them touch the entry list. */
export function applyFieldSignal(
  state: AssistantSnapshot,
  signal: AssistantSignal,
): AssistantSnapshot {
  switch (signal.kind) {
    case "covenant":
      return {
        ...state,
        covenant: { capPaise: signal.capPaise, thumbprint: signal.thumbprint },
      };
    case "sandbox":
      return { ...state, sandbox: signal.session };
    case "settlement":
      return { ...state, txnId: signal.txnId };
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

