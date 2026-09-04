// The seam. `useAssistant` folds a stream of signals into chat entries and
// never learns whether a timer or a socket produced them — which is the whole
// point: the Chat tree renders a fixture reel and a live agent-host run
// through exactly the same code path, so a demo cannot look better than the
// real thing by accident.
import type { SandboxSession } from "../api/agentBeat.ts";
import type { Activity } from "./assistantScript.ts";
import type { OptionRowData } from "./chatScript.ts";

/** The two hold-to-sign gates agent-host stops on. */
export type SignScope = "intent" | "cart";

export type TransportStatus =
  /** The scripted reel, on purpose (fixture mode, or nothing configured). */
  | "fixtures"
  | "connecting"
  /** Live on a push stream — the beat socket, or SSE below it. `detail` names which. */
  | "live"
  /** Live, but over polling because no stream would hold. */
  | "degraded"
  /** The host is unreachable; the reel is standing in and says so. */
  | "offline";

/**
 * A streamed answer, in three parts: fragments as the model writes them, then
 * the harness's verdict on the whole of it. A draft is provisional prose on a
 * screen and never a decision — `say` still carries the text the run stands
 * behind, and a withdrawn draft leaves rather than being quietly rewritten.
 */
export type AssistantSignal =
  | { kind: "say"; text: string; system?: boolean; thinking?: boolean }
  | { kind: "delta"; streamId: string; text: string }
  | { kind: "draft-settled"; streamId: string }
  | { kind: "draft-withdrawn"; streamId: string; reason: string }
  | { kind: "buyer"; text: string }
  | {
      kind: "ask";
      id: string;
      prompt: string;
      replies: string[];
      groups: readonly { label: string; options: readonly string[] }[];
    }
  | { kind: "activity"; activity: Activity }
  | { kind: "work-done" }
  /** The run reached an outcome. The sandbox card reads this: a window still
   *  in `agent-drive` after it is a window with no driver, and a card that
   *  goes on saying "Saathi is driving" over one reads as a hang. */
  | { kind: "run-idle" }
  | { kind: "offer"; options: OptionRowData[] }
  /** Which card the host says was chosen. The choice is app state, not this
   *  component's: a remount must find it, and the model may make it in words. */
  | { kind: "picked"; ref: string }
  | { kind: "covenant"; capPaise: number; thumbprint: string }
  | { kind: "cart-built"; totalPaise: number; itemCount: number }
  /** The sandbox window as the run left it — actions, no picture. */
  | { kind: "sandbox"; session: SandboxSession }
  /** The transaction a run settled into, so the bill can ask after the money. */
  | { kind: "settlement"; txnId: string }
  | { kind: "await-sign"; scope: SignScope }
  | { kind: "signed"; scope: SignScope }
  | { kind: "status"; status: TransportStatus; detail: string | null };

export type Emit = (signal: AssistantSignal) => void;

export interface AssistantTransport {
  /** Whether a real agent-host is behind this, for copy that must not lie. */
  readonly live: boolean;
  /** Begins producing signals; the returned function stops and cleans up. */
  start: (emit: Emit) => () => void;
  /** The buyer said something. */
  send: (text: string) => void;
  /** Release a hold-to-sign gate. `false` means the host refused or is gone. */
  sign: (scope: SignScope) => Promise<boolean>;
}
