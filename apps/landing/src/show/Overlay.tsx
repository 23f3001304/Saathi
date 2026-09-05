import { useRef, type JSX, type RefObject } from "react";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import type { Line } from "./script.ts";
import styles from "./Overlay.module.css";

/*
 * The words over the picture. Three surfaces, all mounted all the time and
 * all switched by one attribute, so a line can fade out while the next one
 * has already changed the words behind it: the narrator's subtitle straight
 * on the dark at the foot of the frame with nothing under it, one small
 * paper card the runtime parks over whoever is talking, and a title card in
 * the upper third for the line that carries one. Nothing here re-renders
 * per frame; the card is moved by writing a transform onto its element.
 */

export interface Shown {
  readonly line: Line | null;
  readonly on: boolean;
}

const DOORS = [
  { href: DEMO_URL, text: "watch the demo" },
  { href: BUILD_URL, text: "see how it is built" },
];

function flag(on: boolean): string {
  return on ? "true" : "false";
}

/** The last line of its kind, so a fading surface keeps its own words. */
function useLastOfKind(line: Line | null, keep: boolean): Line | null {
  const held = useRef<Line | null>(null);
  if (line !== null && keep) held.current = line;
  return held.current;
}

export function Overlay({
  shown,
  last,
  bubbleRef,
}: {
  shown: Shown;
  last: Line | null;
  bubbleRef: RefObject<HTMLDivElement>;
}): JSX.Element {
  const line = shown.line;
  const live = shown.on ? line : null;
  const narrating = live !== null && live.speaker === "narrator";
  const speaking = live !== null && live.speaker !== "narrator";
  const titled = live !== null && live.title !== undefined;
  const caption = useLastOfKind(line, line !== null && line.speaker === "narrator");
  const bubble = useLastOfKind(line, line !== null && line.speaker !== "narrator");
  const title = useLastOfKind(line, line !== null && line.title !== undefined);

  return (
    <>
      <div className={styles.title} data-on={flag(titled)}>
        <p className={styles.titleText}>{title?.title ?? ""}</p>
        {title !== null && title === last ? (
          <p className={styles.doors}>
            {DOORS.map((door) => (
              <a key={door.href} href={door.href}>
                {door.text}
              </a>
            ))}
          </p>
        ) : null}
      </div>

      <div ref={bubbleRef} className={styles.bubble} data-on={flag(speaking)}>
        <p className={styles.hindi} lang="hi">
          {bubble?.text ?? ""}
        </p>
        {bubble?.gloss !== undefined ? (
          <p className={styles.gloss}>{bubble.gloss}</p>
        ) : null}
      </div>

      <div className={styles.caption} data-on={flag(narrating)}>
        <p className={styles.captionText}>{caption?.text ?? ""}</p>
      </div>
    </>
  );
}
