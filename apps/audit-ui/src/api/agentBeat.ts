// The agent-host conversation wire shape, mirrored from
// `apps/agent-host/src/http/chat-beat.ts`. It is a copy rather than an import
// because this app must build with no workspace dependency on the host — the
// contract is the JSON on the socket, and a drift between the two files is a
// contract break that belongs in a review, not a type error at build time.
import type { OptionRowData } from "../conversation/chatScript.ts";

export interface SandboxAction {
  id: string;
  label: string;
  outcome: "ok" | "refused";
  actor: "agent" | "user";
  reason?: string;
}

/** The sandbox card as the host files it: the whole of it except the picture. */
export interface SandboxSession {
  id: string;
  sandbox: { surface: "native-window" | "container"; id: string };
  merchant: string;
  url: string;
  title: string;
  state: "idle" | "agent-drive" | "user-drive" | "closed";
  handoff: { reason: string; ask: string } | null;
  actions: readonly SandboxAction[];
}

export type AgentBeat =
  | { offsetMs: number; kind: "intent-draft"; description: string }
  /** Only ever restored, never live: the client that typed it already drew it. */
  | { offsetMs: number; kind: "buyer"; text: string }
  | { offsetMs: number; kind: "sandbox"; session: SandboxSession }
  | {
      offsetMs: number;
      kind: "intent-signed";
      capPaise: number;
      thumbprint: string;
    }
  | { offsetMs: number; kind: "message"; text: string; variant?: "system" }
  | {
      offsetMs: number;
      kind: "amendment";
      amendmentId: string;
      summary: string;
      widens: boolean;
      changes: readonly unknown[];
    }
  | { offsetMs: number; kind: "delta"; streamId: string; text: string }
  | { offsetMs: number; kind: "draft-settled"; streamId: string }
  | {
      offsetMs: number;
      kind: "draft-withdrawn";
      streamId: string;
      reason: string;
    }
  | {
      offsetMs: number;
      kind: "sort-key";
      sortKey: string;
      memoryId: string;
      label: string;
    }
  | { offsetMs: number; kind: "options"; options: readonly OptionRowData[] }
  /** One move the agent made at a window, as the harness watched it. */
  | { offsetMs: number; kind: "step"; stepId: string; label: string }
  /** The run stopped and is owed an answer; `replies` are the chips to offer. */
  | {
      offsetMs: number;
      kind: "question";
      questionId: string;
      prompt: string;
      replies: readonly string[];
      groups: readonly { label: string; options: readonly string[] }[];
    }
  | {
      offsetMs: number;
      kind: "cart";
      itemCount: number;
      totalPaise: number;
      digest: string;
      quoteOk: boolean;
    }
  | { offsetMs: number; kind: "signing-required" }
  | {
      offsetMs: number;
      kind: "blocked";
      tool: string;
      server: string;
      reason: string;
      human: string;
    }
  | {
      offsetMs: number;
      kind: "memory";
      status: string;
      tierGranted: string | null;
      reasonCode: string | null;
      rule: string | null;
      memoryId: string | null;
    }
  | {
      offsetMs: number;
      kind: "verdict";
      decision: string;
      txnId: string;
      seals: number;
      passed: number;
    }
  | {
      offsetMs: number;
      kind: "outcome";
      state: string;
      txnId: string | null;
      detail: string;
    };

export type AgentBeatKind = AgentBeat["kind"];

const BEAT_KINDS: readonly string[] = [
  "intent-draft",
  "buyer",
  "sandbox",
  "intent-signed",
  "message",
  "amendment",
  "delta",
  "draft-settled",
  "draft-withdrawn",
  "sort-key",
  "options",
  "step",
  "question",
  "cart",
  "signing-required",
  "blocked",
  "memory",
  "verdict",
  "outcome",
];

/**
 * Structural admission only: a beat whose `kind` this build does not know is
 * dropped rather than rendered as a guess. §4.2's "unknown kinds render as a
 * neutral pulli" is the ledger's rule; the conversation's is stricter, because
 * a chat bubble has no neutral shape to fall back to.
 */
export function parseBeat(raw: unknown): AgentBeat | null {
  if (typeof raw !== "object" || raw === null) return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !BEAT_KINDS.includes(kind)) return null;
  return raw as AgentBeat;
}

export interface ChatStateView {
  readonly beats: readonly AgentBeat[];
  readonly awaiting: readonly string[];
  readonly running: boolean;
  /**
   * Which conversation the beats on the hub belong to. The hub is one fan-out
   * for the whole host, and the beats themselves carry no id, so this is the
   * only thing that says whose run a client is watching. `null` means a run
   * started without an id — the CLI, the e2e — or a host whose hub is empty.
   */
  readonly conversation: string | null;
}

/** `GET /chat/state` — the polling fallback's whole world. */
export function parseChatState(raw: unknown): ChatStateView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const beats = (raw as { beats?: unknown }).beats;
  const awaiting = (raw as { awaiting?: unknown }).awaiting;
  if (!Array.isArray(beats)) return null;
  return {
    beats: beats
      .map(parseBeat)
      .filter((beat): beat is AgentBeat => beat !== null),
    awaiting: Array.isArray(awaiting) ? awaiting.filter(isString) : [],
    running: (raw as { running?: unknown }).running === true,
    conversation: conversationOf(raw),
  };
}

function conversationOf(raw: unknown): string | null {
  const held = (raw as { conversation?: unknown }).conversation;
  return typeof held === "string" && held !== "" ? held : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
