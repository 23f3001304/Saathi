// Coming back to a conversation you left. `GET /chat/history` answers with the
// dialogue PTLM holds *and* the run the host wrote down — the option cards, the
// pills, the cart, the verdict, the sandbox's action list — and the beats go
// through `fold`, which is the same function the live stream goes through.
import { parseBeat, type AgentBeat } from "../api/agentBeat.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import { fold } from "./beatFold.ts";
import type { StreamSession } from "./beatSession.ts";

/** One line of the dialogue: the fallback, for a host or a conversation with
 *  no durable beats behind it. */
interface HistoryLine {
  readonly speaker: string;
  readonly text: string;
}

interface RestoredBeat {
  readonly epoch: number;
  readonly index: number;
  readonly beat: AgentBeat;
}

interface Bag {
  readonly lines: readonly HistoryLine[];
  readonly beats: readonly RestoredBeat[];
  readonly cursor: { readonly epoch: number; readonly index: number } | null;
}

function rows(value: unknown, key: string): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  const found = (value as Record<string, unknown>)[key];
  return Array.isArray(found) ? found : [];
}

function isLine(value: unknown): value is HistoryLine {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row["speaker"] === "string" && typeof row["text"] === "string";
}

function beatOf(value: unknown): RestoredBeat | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const beat = parseBeat(row["beat"]);
  if (beat === null) return null;
  const epoch = row["epoch"];
  const index = row["index"];
  if (typeof epoch !== "number" || typeof index !== "number") return null;
  return { epoch, index, beat };
}

function cursorOf(value: unknown): Bag["cursor"] {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Record<string, unknown>)["cursor"];
  if (typeof found !== "object" || found === null) return null;
  const row = found as Record<string, unknown>;
  const epoch = row["epoch"];
  const index = row["index"];
  if (typeof epoch !== "number" || typeof index !== "number") return null;
  return { epoch, index };
}

function bagOf(raw: unknown): Bag {
  return {
    lines: rows(raw, "lines").filter(isLine),
    beats: rows(raw, "beats").flatMap((row) => {
      const parsed = beatOf(row);
      return parsed === null ? [] : [parsed];
    }),
    cursor: cursorOf(raw),
  };
}

function keyOf(speaker: string, text: string): string {
  return `${speaker}:${text.trim().toLowerCase()}`;
}

function spokenKey(signal: AssistantSignal): string | null {
  if (signal.kind === "buyer") return keyOf("user", signal.text);
  if (signal.kind === "say" && signal.system !== true)
    return keyOf("agent", signal.text);
  return null;
}

/**
 * A line restored from memory and the same line arriving as a beat are one
 * line, not two. The claim is spent on the first match, so a sentence the run
 * genuinely says twice still reaches the screen twice.
 */
function claimOnce(session: StreamSession, claims: Set<string>): void {
  const emit = session.emit;
  session.emit = (signal) => {
    const key = spokenKey(signal);
    if (key !== null && claims.delete(key)) return;
    emit(signal);
  };
}

function replayLines(
  session: StreamSession,
  lines: readonly HistoryLine[],
): void {
  if (lines.length === 0) return;
  const claims = new Set<string>();
  for (const line of lines) {
    claims.add(keyOf(line.speaker, line.text));
    session.emit(
      line.speaker === "user"
        ? { kind: "buyer", text: line.text }
        : { kind: "say", text: line.text },
    );
  }
  claimOnce(session, claims);
}

/**
 * DECISION: where beats came back, the dialogue is not replayed as well. Why:
 * the beat log already carries both halves — the shopper's turn is filed with
 * the run it started — and folding both would print every sentence twice. The
 * boundary with the live stream is held by `(epoch, index)` rather than by
 * matching strings, which is exact: `seen` is set to the last beat the log
 * holds, so the hub replays only what came after it.
 */
function replayBeats(session: StreamSession, bag: Bag): void {
  for (const entry of bag.beats) fold(session, entry.beat, entry.index);
  const cursor = bag.cursor;
  if (cursor === null) return;
  session.epoch = cursor.epoch;
  session.restoredEpoch = cursor.epoch;
  session.seen = cursor.index;
}

/**
 * Nothing is written back: a restored beat is history, and re-filing it on
 * every reload would grow a copy of the conversation per refresh inside the
 * very memory the Cart Mandate binds.
 */
export async function restore(
  session: StreamSession,
  chat: string | null,
): Promise<void> {
  if (chat === null) return;
  const query = `conversation_id=${encodeURIComponent(chat)}`;
  try {
    const res = await fetch(`${session.base}/chat/history?${query}`);
    if (!res.ok) return;
    const bag = bagOf(await res.json());
    // The session can be torn down inside that round trip, and a torn-down
    // session's replay still reached the screen: React's development remount
    // starts a second one, so a reloaded chat drew its whole transcript twice,
    // deltas and all, concatenated inside the same bubbles.
    if (session.stopped) return;
    if (bag.beats.length > 0) replayBeats(session, bag);
    else replayLines(session, bag.lines);
  } catch {
    // A chat whose history cannot be reached opens empty, never broken.
  }
}
