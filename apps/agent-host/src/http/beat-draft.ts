// Everything a caller may emit: `ChatBeat` without `offsetMs`, which only the
// hub knows how to fill. It lives apart from the wire shape so the union that
// clients parse and the union that callers construct can both grow without
// either file crossing the line cap.
import type { ChatBeat } from "./chat-beat.js";

/** Everything except `offsetMs`, which only the hub knows how to fill. */
export type BeatDraft =
  | Omit<Extract<ChatBeat, { kind: "intent-draft" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "sandbox" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "intent-signed" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "message" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "amendment" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "delta" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "draft-settled" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "draft-withdrawn" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "sort-key" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "options" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "step" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "question" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "cart" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "signing-required" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "blocked" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "memory" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "verdict" }>, "offsetMs">
  | Omit<Extract<ChatBeat, { kind: "outcome" }>, "offsetMs">;
