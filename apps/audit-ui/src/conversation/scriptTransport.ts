// The fixture side of the seam: the old `useAssistant` timer engine, lifted
// out of React so it is one implementation of `AssistantTransport` rather
// than a second code path through the Chat tree.
import { ASSISTANT_SCRIPT, type Turn } from "./assistantScript.ts";
import type { AssistantTransport, Emit } from "./assistantTransport.ts";

/** The beat of silence after the last activity, before the next turn. */
const WORK_TAIL_MS = 500;

type Session = {
  emit: Emit;
  cursor: number;
  stopped: boolean;
  timers: ReturnType<typeof setTimeout>[];
};

function at(session: Session, ms: number, fn: () => void): void {
  session.timers.push(
    setTimeout(() => {
      if (!session.stopped) fn();
    }, ms),
  );
}

function playWork(
  session: Session,
  turn: Extract<Turn, { kind: "work" }>,
  next: () => void,
): void {
  for (const activity of turn.activities) {
    at(session, activity.afterMs, () =>
      session.emit({ kind: "activity", activity }),
    );
  }
  const last = turn.activities[turn.activities.length - 1];
  at(session, (last?.afterMs ?? 0) + WORK_TAIL_MS, () => {
    session.emit({ kind: "work-done" });
    next();
  });
}

function play(session: Session, script: Turn[]): void {
  const turn = script[session.cursor];
  if (session.stopped || turn === undefined) return;
  const next = (): void => {
    session.cursor += 1;
    play(session, script);
  };
  if (turn.kind === "say") {
    at(session, turn.afterMs, () => {
      session.emit({ kind: "say", text: turn.text });
      next();
    });
    return;
  }
  if (turn.kind === "work") return playWork(session, turn, next);
  // `ask` and `offer` both hand the turn to the buyer and wait for `send`.
  if (turn.kind === "offer")
    return session.emit({ kind: "offer", options: turn.options });
  session.emit({
    kind: "ask",
    id: turn.id,
    prompt: turn.prompt,
    replies: turn.replies,
        groups: [],
  });
}

export function scriptTransport(
  script: Turn[] = ASSISTANT_SCRIPT,
): AssistantTransport {
  let current: Session | null = null;
  return {
    live: false,
    start: (emit) => {
      const session: Session = {
        emit,
        cursor: 0,
        stopped: false,
        timers: [],
      };
      current = session;
      emit({ kind: "status", status: "fixtures", detail: null });
      play(session, script);
      return () => {
        session.stopped = true;
        session.timers.forEach(clearTimeout);
        if (current === session) current = null;
      };
    },
    send: (text) => {
      const session = current;
      if (session === null) return;
      session.emit({ kind: "buyer", text });
      session.cursor += 1;
      play(session, script);
    },
    // Nothing crosses a wire in fixture mode, so the pen always works.
    sign: () => Promise.resolve(true),
  };
}
