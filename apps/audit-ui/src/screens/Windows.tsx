// Every sandbox window in one place. The chat says a window exists; this is
// where it lives, one lane at a time, with the wheel controls the card has
// always carried. The feed only runs for the lane on screen, so ten open
// chats do not mean ten screencasts.
import { useEffect, useState, type JSX } from "react";
import { agentBaseUrl } from "../api/liveMode.ts";
import type { LaneRow } from "../api/lanes.ts";
import { fetchLanes } from "../api/lanes.ts";
import { SandboxPane } from "../conversation/SandboxPane.tsx";
import { readChats } from "../conversation/sessionStore.ts";
import styles from "./Windows.module.css";

const POLL_MS = 3_000;

const ATTENTION_LINE: Record<string, string> = {
  question: "waiting on your reply",
  pick: "waiting on your pick",
  sign: "waiting on your signature",
  handoff: "the window is yours",
};

function titleOf(conversation: string): string {
  const stored = readChats();
  const found = stored?.sessions.find(
    (row) => row.conversationId === conversation,
  );
  return found?.title ?? "Untitled chat";
}

function useLanes(): readonly LaneRow[] {
  const [lanes, setLanes] = useState<readonly LaneRow[]>([]);
  useEffect(() => {
    const base = agentBaseUrl();
    if (base === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (): Promise<void> => {
      const rows = await fetchLanes(base);
      if (stopped) return;
      setLanes(rows.filter((row) => row.conversation !== null));
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);
  return lanes;
}

export function Windows(): JSX.Element {
  const lanes = useLanes();
  const [chosen, setChosen] = useState<string | null>(null);
  const shown =
    lanes.find((row) => row.conversation === chosen) ?? lanes[0] ?? null;
  if (shown === null || shown.conversation === null) {
    return (
      <div className={styles.screen}>
        <p className={styles.empty}>
          No sandbox window is open. Windows appear here when a chat goes to a
          shop; nothing bought in one goes through Saathi, and the payment
          step is always yours.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <div className={styles.lanes}>
        {lanes.map((row) => (
          <button
            key={row.conversation}
            type="button"
            className={
              row.conversation === shown.conversation
                ? styles.laneOn
                : styles.lane
            }
            onClick={() => setChosen(row.conversation)}
          >
            {titleOf(row.conversation ?? "")}
            {row.attention !== null && (
              <span className={styles.attention}>
                {" · "}
                {ATTENTION_LINE[row.attention]}
              </span>
            )}
          </button>
        ))}
      </div>
      <SandboxPane
        active={true}
        conversationId={shown.conversation}
        record={null}
        busy={shown.running}
      />
    </div>
  );
}
