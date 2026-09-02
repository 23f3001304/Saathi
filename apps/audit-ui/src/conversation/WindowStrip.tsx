// The window's presence in the chat, now that the window itself lives on the
// Windows tab: one line saying what is happening there, loud exactly when the
// page needs a person, and a link that goes to it. The live feed no longer
// renders inside the transcript at all, which is also why typing here cannot
// lag behind a repainting frame.
import type { JSX } from "react";
import type { AttentionKind } from "../api/lanes.ts";
import { useRoute } from "../router/useRoute.ts";
import styles from "./WindowStrip.module.css";

export type WindowStripProps = {
  /** A sandbox record exists for this conversation. */
  present: boolean;
  busy: boolean;
  attention: AttentionKind | null;
};

function lineFor(attention: AttentionKind | null, busy: boolean): string {
  if (attention === "handoff") {
    return "The window needs you: a sign-in, a code, or the payment step.";
  }
  if (busy) return "Working in the sandbox window.";
  return "A sandbox window is open for this chat.";
}

export function WindowStrip({
  present,
  busy,
  attention,
}: WindowStripProps): JSX.Element | null {
  const { navigate } = useRoute();
  // No window, no strip. Research runs entirely on live web search now, so
  // a running turn is not evidence of a sandbox: this line over a windowless
  // run claimed a window that did not exist.
  if (!present) return null;
  const urgent = attention === "handoff";
  return (
    <div className={urgent ? styles.stripUrgent : styles.strip}>
      <span className={styles.line}>{lineFor(attention, busy)}</span>
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
