// Chats survived exactly as long as the tab did. Reload and the list was gone
// — not archived, not deleted on purpose, just absent, which reads as the
// product having lost your work.
//
// What is kept here is only the shelf: which chats exist, what they are called,
// which group they are in, which are archived. The words themselves are not a
// browser's to hold — they are in PTLM, written through the gateway's write
// gate and bound into the memory digest the Cart Mandate signs. Rehydrating a
// transcript from there is the right way to bring one back, and it needs the
// conversation id that is being added to the wire.
//
// Every access is guarded. A hardened profile throws on touching `localStorage`
// at all, not merely on writing to it, and a chat list is not worth a blank
// screen: unreadable storage simply means a fresh shelf.
import type { ChatSessionMeta } from "./ChatHistory.tsx";

const STORAGE_KEY = "covenant-chats";

export interface StoredChats {
  readonly sessions: readonly ChatSessionMeta[];
  readonly groups: readonly string[];
  readonly activeId: number;
}

/**
 * The chat's own id, minted when the chat is created and shelved with it.
 * Before this it was minted per transport and frozen at mount, so every reload
 * invented a new one and the last session's dialogue was unfindable.
 */
export function newConversationId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Shelved before ids existed, or shelved with a blank one: either way a chat
 *  with no history to fetch, which is what an empty conversation looks like. */
function conversationIdOf(held: unknown): string | null {
  return typeof held === "string" && held !== "" ? held : null;
}

function sessionOf(value: unknown): ChatSessionMeta | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row["id"] !== "number" ||
    typeof row["title"] !== "string" ||
    typeof row["group"] !== "string" ||
    typeof row["archived"] !== "boolean"
  )
    return null;
  return {
    ...(row as unknown as ChatSessionMeta),
    conversationId: conversationIdOf(row["conversationId"]),
  };
}

/**
 * Two tabs on this app each mint shelf ids from their own counter and write
 * the same storage key, so a shelf can come back holding two rows with one
 * id. Everything downstream keys on the id — `hidden={id !== activeId}`,
 * React's list keys — so a duplicate renders two live chat bodies stacked in
 * one column. Later duplicates get fresh ids; their conversations survive.
 */
function uniquelyIdentified(
  rows: readonly ChatSessionMeta[],
): readonly ChatSessionMeta[] {
  const seen = new Set<number>();
  let next = Math.max(0, ...rows.map((row) => row.id)) + 1;
  return rows.map((row) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      return row;
    }
    const fresh = { ...row, id: next };
    seen.add(next);
    next += 1;
    return fresh;
  });
}

function parse(raw: string): StoredChats | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) return null;
  const held = value as Record<string, unknown>;
  const sessions = held["sessions"];
  const groups = held["groups"];
  if (!Array.isArray(sessions) || !Array.isArray(groups)) return null;
  const kept = uniquelyIdentified(
    sessions
      .map(sessionOf)
      .filter((row): row is ChatSessionMeta => row !== null),
  );
  if (kept.length === 0) return null;
  return {
    sessions: kept,
    groups: groups.filter((name): name is string => typeof name === "string"),
    activeId:
      typeof held["activeId"] === "number" ? held["activeId"] : kept[0].id,
  };
}

export function readChats(): StoredChats | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parse(raw);
  } catch {
    return null;
  }
}

export function writeChats(chats: StoredChats): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // A chat list is not worth a thrown render.
  }
}
