import { useState, type JSX } from "react";
import styles from "./ChatHistory.module.css";

export type SessionStatus = "new" | "in-progress" | "signed";

export type ChatSessionMeta = {
  id: number;
  startedAt: string;
  title: string;
  status: SessionStatus;
  group: string;
  archived: boolean;
  /** Which conversation in PTLM this chat's transcript is filed under. `null`
   *  for a chat shelved before ids existed: nothing to rehydrate. */
  conversationId: string | null;
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  new: "New",
  "in-progress": "In progress",
  signed: "Signed",
};

type RowProps = {
  session: ChatSessionMeta;
  active: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function Row({
  session,
  active,
  onSelect,
  onArchive,
  onDelete,
}: RowProps): JSX.Element {
  return (
    <div className={active ? `${styles.row} ${styles.rowOn}` : styles.row}>
      <button type="button" className={styles.open} onClick={onSelect}>
        <span className={styles.title}>{session.title}</span>
        <span
          className={`${styles.status} ${styles[`status_${session.status}`]}`}
        >
          {STATUS_LABEL[session.status]}
        </span>
        <span className={styles.time}>{session.startedAt}</span>
      </button>
      <span className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          title={session.archived ? "Unarchive" : "Archive"}
          aria-label={session.archived ? "Unarchive chat" : "Archive chat"}
          onClick={onArchive}
        >
          {session.archived ? "Restore" : "Archive"}
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.danger}`}
          aria-label="Delete chat"
          onClick={onDelete}
        >
          Delete
        </button>
      </span>
    </div>
  );
}

type ChatHistoryProps = {
  sessions: ChatSessionMeta[];
  activeId: number;
  groups: string[];
  onSelect: (id: number) => void;
  onToggleArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onNewGroup: (name: string) => void;
};

function NewGroup({
  onNewGroup,
}: {
  onNewGroup: (name: string) => void;
}): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit(): void {
    const name = draft.trim();
    if (name !== "") onNewGroup(name);
    setDraft("");
    setAdding(false);
  }

  if (!adding) {
    return (
      <button
        type="button"
        className={styles.newGroup}
        onClick={() => setAdding(true)}
      >
        + New group
      </button>
    );
  }
  return (
    <input
      className={styles.groupInput}
      value={draft}
      autoFocus
      placeholder="Group name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setAdding(false);
      }}
    />
  );
}

/**
 * Chats organised the way people actually keep them: grouped, archivable,
 * deletable. Archive hides a finished chat without destroying its record;
 * delete is for chats that should never have existed.
 */
export function ChatHistory({
  sessions,
  activeId,
  groups,
  onSelect,
  onToggleArchive,
  onDelete,
  onNewGroup,
}: ChatHistoryProps): JSX.Element {
  const [showArchived, setShowArchived] = useState(false);
  const live = sessions.filter((s) => !s.archived);
  const archived = sessions.filter((s) => s.archived);

  return (
    <div className={styles.history} role="listbox" aria-label="Chats">
      {groups.map((group) => {
        const inGroup = live.filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group}>
            <p className={styles.group}>{group}</p>
            {[...inGroup].reverse().map((session) => (
              <Row
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={() => onSelect(session.id)}
                onArchive={() => onToggleArchive(session.id)}
                onDelete={() => onDelete(session.id)}
              />
            ))}
          </section>
        );
      })}
      <div className={styles.footer}>
        <NewGroup onNewGroup={onNewGroup} />
        {archived.length > 0 && (
          <button
            type="button"
            className={styles.newGroup}
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            Archived ({archived.length})
          </button>
        )}
      </div>
      {showArchived &&
        [...archived]
          .reverse()
          .map((session) => (
            <Row
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={() => onSelect(session.id)}
              onArchive={() => onToggleArchive(session.id)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
    </div>
  );
}
