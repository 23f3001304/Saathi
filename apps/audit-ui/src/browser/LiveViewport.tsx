import { useEffect, useState, type JSX, type KeyboardEvent } from "react";
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
  // Held in state rather than a ref so the wheel listener is attached the
  // render the surface appears in: the placeholder above renders first, and a
  // ref read in an effect that never runs again would be null forever.
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const width = session.frameWidth ?? 0;
  const height = session.frameHeight ?? 0;

  /**
   * DECISION: a native listener rather than React's `onWheel`. Why: React
   * registers wheel handlers passively, so `preventDefault()` inside one is a
   * no-op — the wheel over the picture scrolled the transcript underneath it
   * while the sandbox page stood still. Only a listener registered with
   * `{ passive: false }` can take the gesture, so while the window is yours
   * this surface owns the wheel outright: sideways too, where there is
   * nothing to relay but the page behind must still not move.
   */
  useEffect(() => {
    if (surface === null || !interactive) return;
    const wheeled = (event: WheelEvent): void => {
      event.preventDefault();
      const dy = Math.round(event.deltaY);
      if (dy !== 0) onRelay({ kind: "scroll", dy });
    };
    surface.addEventListener("wheel", wheeled, { passive: false });
    return () => surface.removeEventListener("wheel", wheeled);
  }, [surface, interactive, onRelay]);

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
      ref={setSurface}
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
      onPaste={(event) => {
        if (!interactive) return;
        // A coupon code or an address arrives by paste as often as by
        // keys; without this the viewport silently ate Ctrl+V.
        const text = event.clipboardData.getData("text");
        if (text === "") return;
        event.preventDefault();
        onRelay({ kind: "type", text });
      }}
    >
      <img
        className={styles.frame}
        src={session.frame}
        alt={session.title}
        draggable={false}
        onClick={(event) => {
          if (!interactive) return;
          surface?.focus();
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
