// The window's presence in the chat, now that the window itself lives on the
// Windows tab: one line saying what is happening there, loud exactly when the
// page needs a person, and a link that goes to it. The live feed no longer
// renders inside the transcript at all, which is also why typing here cannot
// lag behind a repainting frame.
import type { JSX } from "react";
import type { SandboxSession } from "../api/agentBeat.ts";
import type { AttentionKind } from "../api/lanes.ts";
import { useRoute } from "../router/useRoute.ts";
import styles from "./WindowStrip.module.css";

/** What the window itself says it is doing; `null` is a chat with no window. */
export type WindowState = SandboxSession["state"] | null;

export type WindowStripProps = {
  state: WindowState;
  /** A window was asked for and has not yet reported: Chrome is starting. */
  launching?: boolean;
  attention: AttentionKind | null;
};

const LINE: Record<Exclude<SandboxSession["state"], "closed">, string> = {
  "agent-drive": "Working in the sandbox window.",
  "user-drive": "The window is yours.",
  idle: "A sandbox window is open for this chat.",
};

/**
 * DECISION: the line follows the window's own state, not whether a turn is
 * running. Why: research runs on live web search and opens nothing, so a busy
 * chat said "Working in the sandbox window" over a window nobody was in — and
 * over no window at all. `null` is the honest answer for a chat whose window
 * has closed or never opened: no window, no strip.
 */
function lineFor(
  state: WindowState,
  attention: AttentionKind | null,
  launching: boolean,
): string | null {
  if (launching) return "Opening the shop's window… a moment.";
  if (state === null || state === "closed") return null;
  if (attention === "handoff") {
    return "The window needs you: a sign-in, a code, or the payment step.";
  }
  return LINE[state];
}

export function WindowStrip({
  state,
  launching = false,
  attention,
}: WindowStripProps): JSX.Element | null {
  const { navigate } = useRoute();
  const line = lineFor(state, attention, launching);
  if (line === null) return null;
  const urgent = attention === "handoff";
  return (
    <div className={urgent ? styles.stripUrgent : styles.strip}>
      <span className={styles.line}>{line}</span>
      <button
        type="button"
        className={styles.open}
        onClick={() => navigate({ name: "windows" })}
      >
        Open the Windows tab
      </button>
    </div>
  );
}
