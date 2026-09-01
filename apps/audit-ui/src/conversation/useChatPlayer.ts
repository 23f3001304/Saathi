import { useEffect, useState } from "react";
import type { ChatBeat } from "./chatScript.ts";

/** Replays a fixed beat list on a timer — the fixture stand-in for agent-host's SSE. */
export function useChatPlayer(script: ChatBeat[]): ChatBeat[] {
  const [revealed, setRevealed] = useState<ChatBeat[]>([]);

  useEffect(() => {
    setRevealed([]);
    const timers = script.map((beat) =>
      setTimeout(() => setRevealed((prev) => [...prev, beat]), beat.offsetMs),
    );
    return () => timers.forEach((id) => clearTimeout(id));
  }, [script]);

  return revealed;
}
