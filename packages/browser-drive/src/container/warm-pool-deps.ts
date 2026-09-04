import { randomBytes } from "node:crypto";
import type { Logger } from "@covenant/domain";

/**
 * The session id every pre-started container carries.
 *
 * `warm_` says at a glance, in `docker ps` and in the container's own label,
 * that this one was started before anybody asked for it. It keeps the name
 * after it is claimed: docker cannot relabel a running container, and a name
 * that lied would be worse than one that reads oddly. The host's log carries
 * the join from the warm name to the session that claimed it.
 */
export function warmSessionId(): string {
  return `warm_${randomBytes(6).toString("hex")}`;
}

/** How often stale warm containers are looked for. Cheap; it is a subtraction. */
export const SWEEP_MS = 30_000;

export interface WarmPoolDeps<T> {
  /** How many to keep ready. Zero turns the pool into a plain cold start. */
  readonly size: number;
  /**
   * How long one may sit warm before it is replaced. It exists because a
   * container carries a hard `timeout` of its own: one that waited half an
   * hour to be claimed would hand its shopper the few minutes it had left.
   */
  readonly maxAgeMs: number;
  readonly start: () => Promise<T>;
  readonly retire: (held: T) => Promise<void>;
  /**
   * Whether a warm one is still there. Optional, defaulting to "assume so".
   *
   * A container can go without asking: its own TTL fires, the daemon restarts,
   * or something reaps by label - `reapOrphans` ends every sandbox container on
   * the machine, so a test suite run beside a live host takes that host's pool
   * with it. Without this the pool goes on believing it holds what it has lost,
   * never refills, and hands the next errand a corpse.
   */
  readonly alive?: (held: T) => boolean;
  readonly now?: () => number;
  readonly logger?: Logger;
  /** Names this pool in the log, so two of them read apart. */
  readonly label?: string;
}

export interface Warm<T> {
  readonly held: T;
  readonly bornAt: number;
}
