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
  if (busy) return "Working in a sandbox window.";
  return "A sandbox window is open for this chat.";
}

export function WindowStrip({
  present,
  busy,
  attention,
}: WindowStripProps): JSX.Element | null {
  const { navigate } = useRoute();
  if (!present && !busy) return null;
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
