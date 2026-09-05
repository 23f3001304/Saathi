import { useCallback, type JSX, type RefObject } from "react";
import { useSound } from "../sound/SoundContext.tsx";
import styles from "./Begin.module.css";

/*
 * No browser will make a sound until someone has clicked something. So the
 * page opens with one thing to click, on the closed curtain and under the
 * name: it puts the sound on and gives the page the small push that starts
 * the curtain. Scrolling past it without clicking runs the show in silence,
 * which is also a way to watch it, and the fixed switch still works.
 */

const COPY = {
  button: "begin the show",
  under: "sound on, scroll to play",
} as const;

/** Where the click leaves the reader: the curtain's first move. */
const OPENING = 0.05;

/** The invitation is up while the reader is this close to the top. */
export const BEGIN_UNTIL = 0.02;

/** Fades the invitation, and takes it out of the tab order as it goes.
 *  The picture says when: the film opens on its own clock. */
export function paintBegin(
  el: HTMLElement | null,
  progress: number,
  until: number = BEGIN_UNTIL,
): void {
  if (el === null) return;
  const want = progress < until ? "true" : "false";
  if (el.dataset.on === want) return;
  el.dataset.on = want;
  const button = el.querySelector("button");
  if (button !== null) button.tabIndex = want === "true" ? 0 : -1;
}

export function Begin({
  wrapRef,
}: {
  wrapRef: RefObject<HTMLDivElement>;
}): JSX.Element {
  const { on, toggle } = useSound();

  const onClick = useCallback((): void => {
    if (!on) toggle();
    const span = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: OPENING * span, behavior: "smooth" });
  }, [on, toggle]);

  /* Off in the markup, so the page served without JavaScript never shows a
     button that cannot do anything; the first frame turns it on. */
  return (
    <div className={styles.begin} ref={wrapRef} data-on="false">
      <button
        type="button"
        className={styles.button}
        tabIndex={-1}
        onClick={onClick}
      >
        {COPY.button}
      </button>
      <p className={styles.under}>{COPY.under}</p>
    </div>
  );
}
