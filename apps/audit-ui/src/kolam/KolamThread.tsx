// §5 — the audit trail, drawn. Owner of Moment (ii)'s break rendering
// (delegated to ThreadBreak) and Moment i/§5.4's live-segment growth.
import { useRef, type JSX } from "react";
import {
  buildThread,
  buildSegment,
  findBreakIndex,
  pulliCenter,
  PITCH,
  type ThreadEvent,
} from "./thread.ts";
import { ThreadBreak } from "./ThreadBreak.tsx";
import { Knot } from "./Knot.tsx";
import { useThreadGrowth } from "../motion/useThreadGrowth.ts";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./KolamThread.module.css";

export type KolamThreadProps = {
  events: ThreadEvent[];
  breakAtIndex?: number;
  width?: number;
  onKnotClick?: (eventId: number) => void;
  animate?: boolean;
};

const TOP_PADDING = 24;

const PERMANENT_LABEL_KINDS = new Set([
  "intent.signed",
  "verdict.emitted",
  "payment.captured",
  "payment.failed",
  "cooloff.parked",
]);

function EmptyThread({ width }: { width: number }): JSX.Element {
  const x0 = width / 2;
  return (
    <svg
      width={width}
      height={TOP_PADDING * 2 + PITCH * 2}
      role="img"
      aria-label="No transaction yet"
    >
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={x0}
          cy={TOP_PADDING + i * PITCH}
          r={4}
          strokeWidth={1.25}
          className={styles.emptyPulli}
        />
      ))}
      <text
        x={8}
        y={TOP_PADDING * 2 + PITCH * 2 - 8}
        className={styles.emptyLabel}
      >
        No transaction yet.
      </text>
    </svg>
  );
}

export function KolamThread({
  events,
  breakAtIndex,
  width = 132,
  onKnotClick,
  animate = true,
}: KolamThreadProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const liveKnotRef = useRef<SVGGElement>(null);
  const reducedMotion = useReducedMotion();
  const x0 = width / 2;

  useThreadGrowth(
    containerRef,
    livePathRef,
    liveKnotRef,
    animate ? events.length : -1,
  );

  if (events.length === 0) {
    return (
      <div className={styles.column}>
        <EmptyThread width={width} />
      </div>
    );
  }

  const breakIndex = breakAtIndex ?? findBreakIndex(events);
  const height =
    TOP_PADDING * 2 +
    events.length * PITCH +
    (breakIndex !== undefined ? 14 : 0);
  const settled = buildThread(events.slice(0, -1), x0, TOP_PADDING);
  const lastIndex = events.length - 1;
  const liveSegment = buildSegment(events, lastIndex, x0, TOP_PADDING);

  return (
    <div className={styles.column} ref={containerRef} data-kolam-thread="true">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Audit thread, ${events.length} events`}
      >
        {breakIndex !== undefined ? (
          <ThreadBreak
            events={events}
            breakIndex={breakIndex}
            x0={x0}
            y0={TOP_PADDING}
            reducedMotion={reducedMotion}
            onKnotClick={onKnotClick}
          />
        ) : (
          <>
            <path d={settled} className={styles.thread} />
            {animate ? (
              <path
                ref={livePathRef}
                d={liveSegment}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={reducedMotion ? 0 : 1}
                className={styles.live}
              />
            ) : (
              <path d={liveSegment} className={styles.thread} />
            )}
            {events.map((event, i) => {
              const isLast = i === lastIndex;
              const label =
                event.label ??
                (PERMANENT_LABEL_KINDS.has(event.kind)
                  ? event.kind
                  : undefined);
              return (
                <g key={event.id} ref={isLast ? liveKnotRef : undefined}>
                  <Knot
                    {...pulliCenter(event, i, x0, TOP_PADDING)}
                    kind={event.knot}
                    status={event.status}
                    label={label}
                    alwaysShowLabel={
                      label !== undefined &&
                      PERMANENT_LABEL_KINDS.has(event.kind)
                    }
                    onActivate={() => onKnotClick?.(event.id)}
                  />
                </g>
              );
            })}
          </>
        )}
      </svg>
    </div>
  );
}
