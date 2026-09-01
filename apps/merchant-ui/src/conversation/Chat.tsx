// Chats, plural. A shopkeeper works one thing at a time — this morning's
// pricing, last week's refunds — and a single scrolling thread makes them
// scroll past one to reach the other.
import { useEffect, useRef, useState, type JSX } from "react";
import { ChatSession } from "./ChatSession.tsx";
import {
  ChatHistory,
  type ChatSessionMeta,
  type SessionStatus,
} from "./ChatHistory.tsx";
import { newConversationId, readChats, writeChats } from "./sessionStore.ts";
import { forgetTurns } from "./turnStore.ts";
import type { MerchantTransport } from "../assistant/transport.ts";
import type { ShopData } from "../data/useShopData.ts";
import styles from "./Chat.module.css";

type ChatProps = {
  data: ShopData;
  shopSlug: string;
  canSign: boolean;
  transport?: MerchantTransport;
  onOpenListing: (itemId: string) => void;
};

const DEFAULT_GROUP = "Chats";

function timeLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function freshSession(id: number, group: string): ChatSessionMeta {
  return {
    id,
    startedAt: timeLabel(),
    title: "New chat",
    status: "new",
    group,
    archived: false,
    // Minted with the chat, not at mount: it has to outlive the tab or the
    // transcript filed under it is unfindable after a reload.
    conversationId: newConversationId(),
  };
}

/** A chat shelved before ids existed has no transcript to find; giving it one
 *  now stops it emptying itself on every reload from here on. */
function identified(
  shelved: readonly ChatSessionMeta[] | undefined,
): ChatSessionMeta[] | null {
  if (shelved === undefined || shelved.length === 0) return null;
  return shelved.map((session) =>
    session.conversationId === null
      ? { ...session, conversationId: newConversationId() }
      : { ...session },
  );
}

/**
 * The shelf, held behind one quiet control — the shopper's, to the letter. Every
 * session stays mounted so switching between two chats does not re-run either.
 */
export function Chat({
  data,
  shopSlug,
  canSign,
  transport,
  onOpenListing,
}: ChatProps): JSX.Element {
  const stored = useRef(readChats()).current;
  const [sessions, setSessions] = useState<ChatSessionMeta[]>(
    identified(stored?.sessions) ?? [freshSession(1, DEFAULT_GROUP)],
  );
  const [groups, setGroups] = useState<string[]>(
    stored?.groups.length ? stored.groups.slice() : [DEFAULT_GROUP],
  );
  const [activeGroup, setActiveGroup] = useState(DEFAULT_GROUP);
  const [activeId, setActiveId] = useState(stored?.activeId ?? 1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const nextId = useRef(
    Math.max(0, ...(stored?.sessions.map((row) => row.id) ?? [0])) + 1,
  );

  useEffect(() => {
    writeChats({ sessions, groups, activeId });
  }, [sessions, groups, activeId]);

  const active = sessions.find((s) => s.id === activeId);

  function newSession(group = activeGroup): void {
    const id = nextId.current;
    nextId.current += 1;
    setSessions((prev) => [...prev, freshSession(id, group)]);
    setActiveId(id);
    setHistoryOpen(false);
  }

  /** Deleting a chat takes its words with it, and has to leave you somewhere. */
  function deleteSession(id: number): void {
    forgetTurns(sessions.find((s) => s.id === id)?.conversationId ?? null);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === activeId) {
        const fallback = next[next.length - 1];
        if (fallback !== undefined) setActiveId(fallback.id);
        else newSession();
      }
      return next;
    });
  }

  // Updaters must return `prev` untouched when nothing changed, or the
  // reporting effects in ChatSession re-fire forever on the new identity.
  function titleFor(id: number): (title: string) => void {
    return (title) =>
      setSessions((prev) => {
        const target = prev.find((s) => s.id === id);
        if (target === undefined || target.title !== "New chat") return prev;
        return prev.map((s) => (s.id === id ? { ...s, title } : s));
      });
  }

  function statusFor(id: number): (status: SessionStatus) => void {
    return (status) =>
      setSessions((prev) => {
        const target = prev.find((s) => s.id === id);
        if (target === undefined || target.status === status) return prev;
        return prev.map((s) => (s.id === id ? { ...s, status } : s));
      });
  }

  return (
    <div className={styles.sessions}>
      <div className={styles.sessionBar}>
        <button
          type="button"
          className={styles.historyButton}
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((v) => !v)}
        >
          {active?.title ?? "Chats"}
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={styles.newChat}
          onClick={() => newSession()}
        >
          + New chat
        </button>
        {historyOpen && (
          <ChatHistory
            sessions={sessions}
            activeId={activeId}
            groups={groups}
            onSelect={(id) => {
              setActiveId(id);
              const picked = sessions.find((s) => s.id === id);
              if (picked !== undefined) setActiveGroup(picked.group);
              setHistoryOpen(false);
            }}
            onToggleArchive={(id) =>
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === id ? { ...s, archived: !s.archived } : s,
                ),
              )
            }
            onDelete={deleteSession}
            onNewGroup={(name) => {
              setGroups((prev) =>
                prev.includes(name) ? prev : [...prev, name],
              );
              setActiveGroup(name);
              newSession(name);
            }}
          />
        )}
      </div>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={styles.sessionBody}
          hidden={session.id !== activeId}
        >
          <ChatSession
            data={data}
            shopSlug={shopSlug}
            canSign={canSign}
            transport={transport}
            onOpenListing={onOpenListing}
            conversationId={session.conversationId}
            onTitle={titleFor(session.id)}
            onStatus={statusFor(session.id)}
          />
        </div>
      ))}
    </div>
  );
}
