// The assistant's turn engine, reduced to a fold over transport signals.
// Timing, sockets and retries live behind `AssistantTransport`; what is left
// here is the one thing React needs to own — the snapshot the Chat tree reads.
import { useCallback, useEffect, useState } from "react";
import {
  applySignal,
  emptySnapshot,
  type AssistantSnapshot,
} from "./assistantState.ts";
import type { AssistantTransport, SignScope } from "./assistantTransport.ts";

export type { ChatEntry, Question } from "./assistantState.ts";

export type AssistantState = AssistantSnapshot & {
  /** The buyer's turn: an answer, or the sentence that starts a run. */
  answer: (text: string) => void;
  /** Release a hold-to-sign gate. `false` when the host would not take it. */
  sign: (scope: SignScope) => Promise<boolean>;
  /** Whether a real agent-host is behind this session. */
  live: boolean;
};

export function useAssistant(transport: AssistantTransport): AssistantState {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>(emptySnapshot);

  useEffect(() => {
    setSnapshot(emptySnapshot);
    return transport.start((signal) =>
      setSnapshot((prev) => applySignal(prev, signal)),
    );
  }, [transport]);

  const answer = useCallback(
    (text: string) => transport.send(text),
    [transport],
  );
  const sign = useCallback(
    (scope: SignScope) => transport.sign(scope),
    [transport],
  );

  return { ...snapshot, answer, sign, live: transport.live };
}
