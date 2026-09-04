/**
 * The conversation wire shape. It is `ChatBeat` from
 * `apps/audit-ui/src/conversation/chatScript.ts`, field for field, so the Bench
 * swaps its fixture player for this stream by changing where the beats come
 * from and nothing else (§4.10).
 *
 * The `delta` / `draft-settled` / `draft-withdrawn` trio is one streamed answer
 * as it is written: fragments addressed by `streamId`, then the verdict the
 * harness reached on the whole of it. They are ordinary beats in the ordinary
 * log, appended once and replayed like any other, which is what makes a client
 * that reconnects mid-sentence ends up with the text a client that never
 * dropped has.
 *
 * The Conversation tree filters on `kind`, so a kind a client does not know
 * renders as nothing rather than as a crash — which is what lets the host say
 * more than the UI currently reads.
 */
import type { AmendmentChange } from "@covenant/agents";

export interface OptionRowData {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly pricePaise: number;
  readonly rating: number;
  readonly deliveryDays: number;
  readonly merchant: string;
  /** The merchant's own picture, absent where they gave none. Optional on the
   *  wire, so a row without one stays the shape the card already renders. */
  readonly imageUrl?: string;
  /** The evidence tier behind `pricePaise`. `false` says the number is a
   *  page's own printed characters: read, not quoted, and nobody signed it. */
  readonly quoteSigned?: boolean;
  /** The listing an open-web row was read off — what makes the card say where
   *  its unsigned number came from, and the ref's own record of a page this
   *  host opened. Never a URL a model named. */
  readonly sourceUrl?: string;
}

export interface SandboxActionData {
  readonly id: string;
  readonly label: string;
  readonly outcome: "ok" | "refused";
  readonly actor: "agent" | "user";
  readonly reason?: string;
}

/** The sandbox card as data: all of it except the picture. The window is gone
 *  once the run ends; the action list is the half worth keeping. */
export interface SandboxView {
  readonly id: string;
  readonly sandbox: {
    readonly surface: "native-window" | "container";
    readonly id: string;
  };
  readonly merchant: string;
  readonly url: string;
  readonly title: string;
  readonly state: "idle" | "agent-drive" | "user-drive" | "closed";
  readonly handoff: {
    readonly reason: string;
    readonly ask: string;
  } | null;
  readonly actions: readonly SandboxActionData[];
}

export type ChatBeat =
  | {
      readonly offsetMs: number;
      readonly kind: "intent-draft";
      readonly description: string;
    }
  /** Written to the durable log by `ChatService`, never published live: the
   *  client that typed the sentence has already drawn it. */
  | { readonly offsetMs: number; readonly kind: "buyer"; readonly text: string }
  | {
      readonly offsetMs: number;
      readonly kind: "sandbox";
      readonly session: SandboxView;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "intent-signed";
      readonly capPaise: number;
      readonly thumbprint: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "message";
      readonly text: string;
      /** "system" is the harness's own voice; "thinking" is the agent
       *  working, which the shopper can open but is not shown by default. */
      readonly variant?: "system" | "thinking";
    }
  | {
      readonly offsetMs: number;
      readonly kind: "amendment";
      readonly amendmentId: string;
      readonly summary: string;
      /** True when any one change gives the agent more room than it has now. */
      readonly widens: boolean;
      readonly changes: readonly AmendmentChange[];
    }
  | {
      readonly offsetMs: number;
      readonly kind: "delta";
      readonly streamId: string;
      readonly text: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "draft-settled";
      readonly streamId: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "draft-withdrawn";
      readonly streamId: string;
      readonly reason: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "sort-key";
      readonly sortKey: string;
      readonly memoryId: string;
      readonly label: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "options";
      readonly options: readonly OptionRowData[];
    }
  /** The card the shopper (or the model, naming it in words) chose. Replayed
   *  from the log so a reload or a route change does not forget the choice. */
  | { readonly offsetMs: number; readonly kind: "picked"; readonly ref: string }
  /**
   * One move the agent made at a window, as the harness watched it. Research
   * happens without a window on screen, and a phase with nothing to show is
   * not a phase with nothing to say: these are what the shopper reads instead.
   */
  | {
      readonly offsetMs: number;
      readonly kind: "step";
      readonly stepId: string;
      readonly label: string;
    }
  /** The run stopped and is owed an answer. It carries the chips too: the
   *  composer, not the transcript, is where a shopper answers a question. */
  | {
      readonly offsetMs: number;
      readonly kind: "question";
      readonly questionId: string;
      readonly prompt: string;
      readonly replies: readonly string[];
      /** A compound ask's labelled axes; empty for a simple question. */
      readonly groups: readonly {
        readonly label: string;
        readonly options: readonly string[];
      }[];
    }
  | {
      readonly offsetMs: number;
      readonly kind: "cart";
      readonly itemCount: number;
      readonly totalPaise: number;
      readonly digest: string;
      readonly quoteOk: boolean;
    }
  | { readonly offsetMs: number; readonly kind: "signing-required" }
  | {
      readonly offsetMs: number;
      readonly kind: "blocked";
      readonly tool: string;
      readonly server: string;
      readonly reason: string;
      readonly human: string;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "memory";
      readonly status: string;
      readonly tierGranted: string | null;
      readonly reasonCode: string | null;
      readonly rule: string | null;
      readonly memoryId: string | null;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "verdict";
      readonly decision: string;
      readonly txnId: string;
      readonly seals: number;
      readonly passed: number;
    }
  | {
      readonly offsetMs: number;
      readonly kind: "outcome";
      readonly state: string;
      readonly txnId: string | null;
      readonly detail: string;
    };
