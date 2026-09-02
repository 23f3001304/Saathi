// §4.10 — the lane list. One cheap GET the shelf polls to learn which chats
// are running, which are waiting in line, and which have stopped because they
// need a person: a question, a pick, a signature, a handoff.
export type AttentionKind = "question" | "pick" | "sign" | "handoff";

export interface LaneRow {
  readonly conversation: string | null;
  readonly running: boolean;
  /** Place in the global line, or `null` when not waiting. */
  readonly queued: number | null;
  readonly attention: AttentionKind | null;
  /** Whether this lane holds an open sandbox window right now. */
  readonly window: boolean;
}

const KINDS: readonly string[] = ["question", "pick", "sign", "handoff"];

function rowOf(value: unknown): LaneRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const conversation = row["conversation"];
  const queued = row["queued"];
  const attention = row["attention"];
  return {
    conversation: typeof conversation === "string" ? conversation : null,
    running: row["running"] === true,
    queued: typeof queued === "number" ? queued : null,
    attention:
      typeof attention === "string" && KINDS.includes(attention)
        ? (attention as AttentionKind)
        : null,
    window: row["window"] === true,
  };
}

/** An unreachable host is an empty list, never an error: the shelf must not
 *  break over a badge. */
export async function fetchLanes(base: string): Promise<readonly LaneRow[]> {
  try {
    const res = await fetch(`${base}/chat/lanes`);
    if (!res.ok) return [];
    const body = (await res.json()) as { lanes?: unknown };
    if (!Array.isArray(body.lanes)) return [];
    return body.lanes.flatMap((raw) => {
      const row = rowOf(raw);
      return row === null ? [] : [row];
    });
  } catch {
    return [];
  }
}

/** The Forget button: closes the window and deletes its stored profile -
 *  the sign-in, the cookies - while the chat itself stays. */
export async function forgetWindow(
  base: string,
  conversation: string,
): Promise<void> {
  try {
    await fetch(`${base}/chat/window/forget`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation }),
    });
  } catch {
    // The next lanes poll shows whatever actually happened.
  }
}

