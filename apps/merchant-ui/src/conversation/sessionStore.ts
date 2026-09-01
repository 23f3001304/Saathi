// Chats survived exactly as long as the tab did. Reload and the list was gone
// — not archived, not deleted on purpose, just absent, which reads as the
// product having lost your work.
//
// This is the shelf: which chats exist, what they are called, which group they
// are in, which are archived. The words are kept beside it in `turnStore.ts`.
//
// DECISION: both live in this browser, unlike the shopper's, whose transcript
// is in PTLM and comes back over `GET /chat/history`. There is no merchant
// equivalent to fetch: every turn here is computed on the page from reads the
// shopkeeper can already see, so no server ever held one. If the transport
// named in `assistant/transport.ts` ever becomes a model on a server, that
// server's history is where this should read from instead — a transcript a
// model produced is not the browser's to be the only copy of.
//
// Every access is guarded. A hardened profile throws on touching
// `localStorage` at all, not merely on writing to it, and a chat list is not
// worth a blank screen: unreadable storage simply means a fresh shelf.
import type { ChatSessionMeta } from "./ChatHistory.tsx";

const STORAGE_KEY = "covenant-shop-chats";

export interface StoredChats {
  readonly sessions: readonly ChatSessionMeta[];
  readonly groups: readonly string[];
  readonly activeId: number;
}

/** The chat's own id, minted when the chat is created and shelved with it —
 *  it is what the transcript is filed under, so it has to outlive the tab. */
export function newConversationId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Shelved with no id: a chat with no transcript filed anywhere, which is
 *  what an empty conversation looks like. */
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

function parse(raw: string): StoredChats | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) return null;
  const held = value as Record<string, unknown>;
  const sessions = held["sessions"];
  const groups = held["groups"];
  if (!Array.isArray(sessions) || !Array.isArray(groups)) return null;
  const kept = sessions
    .map(sessionOf)
    .filter((row): row is ChatSessionMeta => row !== null);
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
