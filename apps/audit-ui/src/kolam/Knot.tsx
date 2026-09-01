import { useState, type JSX, type KeyboardEvent } from "react";
import type { KnotKind, ThreadStatus } from "./thread.ts";
import styles from "./Knot.module.css";

type KnotProps = {
  x: number;
  y: number;
  kind: KnotKind;
  status: ThreadStatus;
  label?: string;
  alwaysShowLabel?: boolean;
  onActivate?: () => void;
};

function pulli(status: ThreadStatus): JSX.Element {
  const cls =
    status === "fail" ? `${styles.pulli} ${styles.pulliFail}` : styles.pulli;
  return <circle r={4} strokeWidth={1.25} className={cls} />;
}

function seal(): JSX.Element {
  return (
    <>
      <circle r={4} strokeWidth={1.25} className={styles.seal} />
      <circle r={6} strokeWidth={1.25} className={styles.seal} />
    </>
  );
}

function lozenge(status: ThreadStatus): JSX.Element {
  const cls = status === "fail" ? styles.lozengeFail : styles.lozengePass;
  return (
    <rect
      x={-3.5}
      y={-3.5}
      width={7}
      height={7}
      transform="rotate(45)"
      className={cls}
    />
  );
}

function hex(): JSX.Element {
  return (
    <path
      d="M3 0 1.5 2.6 -1.5 2.6 -3 0 -1.5 -2.6 1.5 -2.6Z"
      strokeWidth={1.25}
      className={styles.hex}
    />
  );
}

function disc(): JSX.Element {
  return <circle r={5} className={styles.disc} />;
}

function discRing(): JSX.Element {
  return (
    <>
      <circle r={5} className={styles.disc} />
      <circle r={8} strokeWidth={1.25} className={styles.discRing} />
    </>
  );
}

function hollowDisc(): JSX.Element {
  return <circle r={5} strokeWidth={1.25} className={styles.hollowDisc} />;
}

function open(): JSX.Element {
  return (
    <path
      d="M -3 -5.2 A 6 6 0 1 1 -3 5.2"
      strokeWidth={1.25}
      className={styles.open}
    />
  );
}

function tick(): JSX.Element {
  return (
    <line
      x1={-3}
      y1={0}
      x2={3}
      y2={0}
      strokeWidth={1.25}
      className={styles.tick}
    />
  );
}

function unknown(): JSX.Element {
  return <circle r={2} className={styles.unknown} />;
}

const SHAPES: Record<KnotKind, (status: ThreadStatus) => JSX.Element> = {
  pulli,
  seal: () => seal(),
  lozenge,
  hex: () => hex(),
  disc: () => disc(),
  "disc-ring": () => discRing(),
  "hollow-disc": () => hollowDisc(),
  open: () => open(),
  tick: () => tick(),
  unknown: () => unknown(),
};

function handleKeyDown(
  e: KeyboardEvent<SVGGElement>,
  onActivate?: () => void,
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate?.();
  }
}

/** §5.3/§7.4 — a real navigation control: every knot is keyboard-reachable. */
export function Knot({
  x,
  y,
  kind,
  status,
  label,
  alwaysShowLabel = false,
  onActivate,
}: KnotProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const showLabel = (alwaysShowLabel || hovered) && label !== undefined;

  return (
    <g
      transform={`translate(${x} ${y})`}
      className={styles.knot}
      role="button"
      tabIndex={0}
      aria-label={label ?? `${kind} knot`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={onActivate}
      onKeyDown={(e) => handleKeyDown(e, onActivate)}
    >
      {SHAPES[kind](status)}
      {showLabel && (
        <text
          x={-12}
          y={4}
          className={kind === "unknown" ? styles.labelData : styles.label}
        >
          {label}
        </text>
      )}
    </g>
  );
}
