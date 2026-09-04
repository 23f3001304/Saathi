import type { JSX } from "react";
import type { SandboxSession } from "../api/agentBeat.ts";
import styles from "./VoiceWindow.module.css";

export type VoiceWindowProps = {
  session: SandboxSession;
  /** The last few things the window did, newest last. */
  recent: readonly string[];
};

const STATE_LINE: Record<SandboxSession["state"], string> = {
  "agent-drive": "Working in the shop's window",
  "user-drive": "The window is yours",
  idle: "A window is open",
  closed: "The window has closed",
};

/**
 * What the hands-free surface shows while a window is driving.
 *
 * Voice mode used to show the option cards and nothing else, so the moment a
 * card was tapped the stage went empty: the agent opened a shop, put something
 * in a basket and walked to a checkout, and a shopper who was listening had no
 * idea any of it was happening. Hands-free is not eyes-free, and this is the
 * half of that sentence the surface was missing.
 *
 * It shows what the host itself watched - the shop, the page, the moves it
 * made, and the one thing it is waiting on. No frame stream: the picture lives
 * on the Windows tab, and a voice shopper needs to know where the window IS
 * more than they need to watch it repaint.
 */
export function VoiceWindow({ session, recent }: VoiceWindowProps): JSX.Element {
  const waiting = session.handoff;
  return (
    <section
      className={waiting === null ? styles.panel : styles.panelWaiting}
      aria-live="polite"
    >
      <p className={styles.state}>{STATE_LINE[session.state]}</p>
      <p className={styles.shop}>{session.merchant}</p>
      <p className={styles.page}>{session.title || session.url}</p>
      {recent.length > 0 && (
        <ul className={styles.moves}>
          {recent.map((move, at) => (
            <li key={`${String(at)}-${move}`}>{move}</li>
          ))}
        </ul>
      )}
      {waiting !== null && <p className={styles.asks}>{waiting.ask}</p>}
    </section>
  );
}
