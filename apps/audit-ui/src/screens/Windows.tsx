// Every sandbox window in one place. The chat says a window exists; this is
// where it lives, one lane at a time, with the wheel controls the card has
// always carried. The feed only runs for the lane on screen, so ten open
// chats do not mean ten screencasts.
import { useEffect, useState, type JSX } from "react";
import { agentBaseUrl } from "../api/liveMode.ts";
import type { LaneRow } from "../api/lanes.ts";
import { fetchLanes, forgetWindow } from "../api/lanes.ts";
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

// Only lanes that actually hold a window: an idle chat is not a window, and a
// row of chips over an empty room read as a bug. Ordered by lane id, because
// the host's list has no order of its own and a chip row that reshuffles every
// three seconds is unusable.
function openWindows(rows: readonly LaneRow[]): readonly LaneRow[] {
  return rows
    .filter((row) => row.conversation !== null && row.window)
    .sort((one, two) =>
      (one.conversation ?? "").localeCompare(two.conversation ?? ""),
    );
}

function useLanes(): readonly LaneRow[] {
  const [lanes, setLanes] = useState<readonly LaneRow[]>([]);
  useEffect(() => {
    const base = agentBaseUrl();
    if (base === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // DECISION: one empty answer is not believed. Why: fetchLanes turns an
    // unreachable host, a 500 and a hiccup all into an empty list (lanes.ts),
    // and believing the first one unmounts the pane below - which closes the
    // screencast and shows in agent-host's log as "the subscriber went away"
    // over a window that never went anywhere. Two in a row are believed.
    let blank = 0;
    const tick = async (): Promise<void> => {
      const rows = await fetchLanes(base);
      if (stopped) return;
      const open = openWindows(rows);
      blank = open.length === 0 ? blank + 1 : 0;
      if (open.length > 0 || blank > 1) setLanes(open);
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

/**
 * The lane on screen, latched. The pane below holds one live subscription per
 * conversation id, so whichever lane this names is what the screencast is
 * watching: a name derived fresh from an unordered list would move on its own
 * and spend a full teardown and reconnect on nothing. Once a lane is on screen
 * it stays there until it closes or the shopper picks another.
 */
function useShownLane(lanes: readonly LaneRow[]): {
  shown: LaneRow | null;
  choose: (conversation: string | null) => void;
} {
  const [chosen, setChosen] = useState<string | null>(null);
  const shown =
    lanes.find((row) => row.conversation === chosen) ?? lanes[0] ?? null;
  const held = shown?.conversation ?? null;
  useEffect(() => {
    if (held !== null && held !== chosen) setChosen(held);
  }, [held, chosen]);
  return { shown, choose: setChosen };
}

export function Windows(): JSX.Element {
  const lanes = useLanes();
  const { shown, choose } = useShownLane(lanes);
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
            onClick={() => choose(row.conversation)}
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
      <p className={styles.forgetRow}>
        This window keeps its sign-in and cookies until you say otherwise,
        even across days.{" "}
        <button
          type="button"
          className={styles.forget}
          onClick={() => {
            const base = agentBaseUrl();
            const held = shown.conversation;
            if (base === null || held === null) return;
            void forgetWindow(base, held);
          }}
        >
          Forget this window
        </button>
      </p>
    </div>
  );
}
