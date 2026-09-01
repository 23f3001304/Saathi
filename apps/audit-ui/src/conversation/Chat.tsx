// Chat-first: one centred conversation, like every assistant people already
// know. except this one asks before it spends, shows its work as it
// happens, and ends every purchase at a hold-to-sign, not a buy button.
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { ChatSession } from "./ChatSession.tsx";
import {
  ChatHistory,
  type ChatSessionMeta,
  type SessionStatus,
} from "./ChatHistory.tsx";
import { cancelRun } from "../api/agent.ts";
import { newConversationId, readChats, writeChats } from "./sessionStore.ts";
import styles from "./Chat.module.css";

type ChatProps = {
  offline: boolean;
  trust?: ReactNode;
};

const DEFAULT_GROUP = "Chats";

function freshSession(id: number, group: string): ChatSessionMeta {
  return {
    id,
    startedAt: timeLabel(),
    title: "New chat",
    status: "new",
    group,
    archived: false,
    // Minted with the chat, not with the transport: it has to outlive the tab
    // or the transcript it files the words under is unfindable after a reload.
    conversationId: newConversationId(),
  };
}

/**
 * A chat shelved before conversation ids existed has no identity, so its words
 * were never filed under one and cannot be recovered. Giving it an id now does
 * not bring the old transcript back — nothing can — but it stops the chat being
 * permanently amnesiac, which is the worse of the two failures: an empty chat
 * that will empty itself again on every reload reads as a product that does not
 * work, rather than as one feature that arrived late.
 */
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
 * Chats, plural — held behind one quiet control. A strip of tabs grows into
 * a scrollbar by the fifth chat; a history list does not. Every session
 * stays mounted so its transcript survives a switch.
 */
export function Chat({ offline, trust }: ChatProps): JSX.Element {
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

  // The shelf, not the words: which chats exist and what they are called. The
  // conversations themselves live in PTLM, where they are gated and auditable.
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

  /** Deleting the chat you are in has to leave you somewhere. */
  function deleteSession(id: number): void {
    // A deleted chat takes its working jobs with it: the host aborts the run
    // at its next gate and the sandbox window closes. Fire-and-forget — the
    // shelf must not hang on a host that is down.
    const doomed = sessions.find((s) => s.id === id);
    if (doomed?.conversationId != null) {
      void cancelRun(doomed.conversationId);
    }
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
            offline={offline}
            trust={trust}
            conversationId={session.conversationId}
            onTitle={titleFor(session.id)}
            onStatus={statusFor(session.id)}
            visible={session.id === activeId}
          />
        </div>
      ))}
    </div>
  );
}

function timeLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}
