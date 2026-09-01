// What the Chat tree reads: the snapshot shape and its zero value, in a module
// both halves of the fold can import without importing each other.
import type { SandboxSession } from "../api/agentBeat.ts";
import type { ChatEntry } from "./chatEntry.ts";
import type { OptionRowData } from "./chatScript.ts";
import type { SignScope, TransportStatus } from "./assistantTransport.ts";

export type Question = { id: string; prompt: string; replies: string[] };

/** What the intent signature actually committed to, when a run has said so. */
export type CovenantView = { capPaise: number; thumbprint: string };

export type AssistantSnapshot = {
  entries: ChatEntry[];
  question: Question | null;
  offering: boolean;
  options: OptionRowData[];
  covenant: CovenantView | null;
  /** A window the run opened, restored from the log; live cards come from
   *  `/browser/session`. */
  sandbox: SandboxSession | null;
  awaiting: SignScope | null;
  /** Whether a run is in flight. The sandbox card needs it: a window is only
   *  being driven while one is. */
  running: boolean;
  /** The transaction the run settled into, replayed from the durable log —
   *  which is what lets a reloaded bill ask the gateway about the money
   *  again instead of trusting a cached word. */
  txnId: string | null;
  status: TransportStatus;
  notice: string | null;
};

export const emptySnapshot: AssistantSnapshot = {
  entries: [],
  question: null,
  offering: false,
  options: [],
  covenant: null,
  sandbox: null,
  awaiting: null,
  running: false,
  txnId: null,
  status: "fixtures",
  notice: null,
};
