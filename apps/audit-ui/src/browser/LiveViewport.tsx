import { useRef, type JSX, type KeyboardEvent, type WheelEvent } from "react";
import type { BrowserSessionView } from "./browserSession.ts";
import type { RelayInput } from "./browserTransport.ts";
import { pagePoint } from "./viewportMath.ts";
import styles from "./BrowserSessionCard.module.css";

type LiveViewportProps = {
  session: BrowserSessionView;
  interactive: boolean;
  onRelay: (input: RelayInput) => void;
};

/** Named keys the host will forward; everything else is text or ignored. */
const NAMED_KEYS = new Set([
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function keyInput(event: KeyboardEvent<HTMLDivElement>): RelayInput | null {
  if (NAMED_KEYS.has(event.key)) return { kind: "key", name: event.key };
  // One printable character at a time; modifier chords are never forwarded,
  // because a chord is a browser command and not something typed into a page.
  if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    return { kind: "type", text: event.key };
  }
  return null;
}

/**
 * The picture, and — only while the user holds the wheel — a surface that can
 * be clicked and typed into. Nothing here decides what is allowed: every event
 * becomes a coordinate or a character and the host re-judges it against the
 * same classifier the agent is blocked by. That is why this file has no idea
 * what a password field is.
 */
export function LiveViewport({
  session,
  interactive,
  onRelay,
}: LiveViewportProps): JSX.Element {
  const surface = useRef<HTMLDivElement>(null);
  const width = session.frameWidth ?? 0;
  const height = session.frameHeight ?? 0;

  /**
   * Not a stale picture under a translucent overlay: there is no picture. The
   * host stopped capturing the moment a protected field took focus, so this is
   * the whole of what this page has, and the copy says so plainly.
   */
  if (session.blackout !== undefined) {
    return (
      <div className={styles.placeholder} role="status">
        <span className={styles.pageTitle}>Not looking</span>
        <span className={styles.sandboxNote}>{session.blackout.human}</span>
      </div>
    );
  }

  if (session.frame === undefined) {
    return (
      <div className={styles.placeholder}>
        <span className={styles.pageTitle}>{session.title}</span>
        <span className={styles.sandboxNote}>
          {session.sample !== undefined
            ? "There is no window behind this panel and no picture to show. The lines below are a script, kept so the shape of a session is visible with nothing running."
            : "A disposable Chrome profile. It shares nothing with your own browser: no cookies, no saved passwords, no history."}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={surface}
      className={
        interactive ? `${styles.surface} ${styles.yourTurn}` : styles.surface
      }
      role={interactive ? "application" : "presentation"}
      aria-label={
        interactive
          ? "The sandbox window: your keystrokes go to it"
          : undefined
      }
      tabIndex={interactive ? 0 : -1}
      onKeyDown={(event) => {
        if (!interactive) return;
        const input = keyInput(event);
        if (input === null) return;
        event.preventDefault();
        onRelay(input);
      }}
      onWheel={(event: WheelEvent<HTMLDivElement>) => {
        if (interactive)
          onRelay({ kind: "scroll", dy: Math.round(event.deltaY) });
      }}
    >
      <img
        className={styles.frame}
        src={session.frame}
        alt={session.title}
        draggable={false}
        onClick={(event) => {
          if (!interactive) return;
          surface.current?.focus();
          const box = event.currentTarget.getBoundingClientRect();
          onRelay({
            kind: "click",
            ...pagePoint(box, event.clientX, event.clientY, width, height),
          });
        }}
      />
      {session.redacted !== undefined && session.redacted > 0 && (
        <p className={styles.redacted}>
          {session.redacted === 1
            ? "1 field is blacked out of this picture before it leaves the machine."
            : `${session.redacted} fields are blacked out of this picture before it leaves the machine.`}
        </p>
      )}
    </div>
  );
}
