// The browser notification for a chat that stopped to ask for a person while
// some other chat was on screen. All copy plain and specific; the chat title
// says which conversation is asking.
import type { AttentionKind } from "../api/lanes.ts";

const COPY: Record<AttentionKind, { title: string; body: (chat: string) => string }> = {
  question: {
    title: "Saathi needs an answer",
    body: (chat) => `"${chat}" is waiting on your reply.`,
  },
  pick: {
    title: "Saathi needs a pick",
    body: (chat) => `Options are ready in "${chat}". Pick one to continue.`,
  },
  sign: {
    title: "Saathi needs your signature",
    body: (chat) => `A purchase in "${chat}" is held until you sign.`,
  },
  handoff: {
    title: "Saathi handed you the wheel",
    body: (chat) => `The window in "${chat}" is yours to drive.`,
  },
};

function show(kind: AttentionKind, chat: string, onOpen: () => void): void {
  const copy = COPY[kind];
  // One notification per chat: a newer ask replaces the older one instead of
  // stacking four cards for the same conversation.
  const shown = new Notification(copy.title, {
    body: copy.body(chat),
    tag: `covenant-attention-${chat}`,
  });
  shown.onclick = () => {
    // Focusing is best effort: some browsers refuse it outside a user gesture
    // chain, and the notification has still said what is needed.
    try {
      window.focus();
    } catch {
      // The alert already did its job.
    }
    onOpen();
    shown.close();
  };
}

/**
 * Permission is asked for on the first parked event, not at page load: a
 * permission prompt with no context reads as spam, while one that arrives the
 * moment a background chat first needs its person explains itself. Denied or
 * unsupported degrades to the shelf badge alone.
 */
export function notifyAttention(
  kind: AttentionKind,
  chat: string,
  onOpen: () => void,
): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    show(kind, chat, onOpen);
    return;
  }
  if (Notification.permission === "denied") return;
  void Notification.requestPermission()
    .then((granted) => {
      if (granted === "granted") show(kind, chat, onOpen);
    })
    .catch(() => undefined);
}
