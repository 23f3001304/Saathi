import type { JSX } from "react";
import styles from "./Sandbox.module.css";

/*
 * DECISION: the sandbox is drawn, not screenshotted: an SVG shop in the
 * house wireframe style with the agent's presence as an indigo ring that
 * roams the listings, dwells, and moves on. Drawn UI keeps the promise
 * honest (nothing here pretends to be a real merchant) and stays crisp at
 * every size for free. Resting a cursor on the window pauses the agent
 * mid-errand and raises "you have the wheel": the product's takeover
 * gesture, felt on the marketing page.
 */
const TILES: Array<{ x: number; y: number; price: string }> = [
  { x: 24, y: 36, price: "₹3,650" },
  { x: 152, y: 36, price: "₹3,890" },
  { x: 280, y: 36, price: "₹4,560" },
  { x: 24, y: 148, price: "₹3,990" },
  { x: 152, y: 148, price: "₹5,120" },
  { x: 280, y: 148, price: "₹2,980" },
];

function Tile({ x, y, price }: { x: number; y: number; price: string }): JSX.Element {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="96" height="64" className={styles.plate} rx="1" />
      <rect x="8" y="8" width="80" height="30" className={styles.weave} rx="1" />
      <rect x="8" y="44" width="52" height="4" className={styles.line} rx="1" />
      <text x="8" y="60" className={styles.price}>
        {price}
      </text>
    </g>
  );
}

export function Sandbox(): JSX.Element {
  return (
    <figure className={styles.window} data-reveal tabIndex={0}>
      <span className={styles.bar}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.url}>saathi is at · shop.example/running-shoes</span>
        <span className={styles.live}>live</span>
      </span>
      <svg
        className={styles.page}
        viewBox="0 0 400 232"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <rect x="24" y="12" width="180" height="8" className={styles.line} rx="1" />
        {TILES.map((t) => (
          <Tile key={`${t.x}-${t.y}`} {...t} />
        ))}
        <g className={styles.agent}>
          <circle r="7" className={styles.agentRing} />
          <circle r="2.5" className={styles.agentCore} />
        </g>
      </svg>
      <span className={styles.wheel}>
        <span className={`stamp ${styles.wheelStamp}`}>you have the wheel</span>
        <span className={styles.wheelNote}>it waits · it hands the wheel back when you are done</span>
      </span>
      <figcaption className={styles.note}>
        every page saathi visits, you can watch live · take the wheel any
        time, it hands it back
      </figcaption>
    </figure>
  );
}
