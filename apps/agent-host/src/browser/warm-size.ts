/**
 * How many sandboxes this host keeps started before anybody asks.
 *
 * A leaf on purpose: `session-capacity.ts` subtracts these from the window cap
 * and `sandbox-plan.ts` builds the pools from them, and neither may import the
 * other. Both read the same two numbers from here.
 */

/** One of each. Enough that the first action of a run pays no launch, small
 *  enough that a demo machine is not holding two idle browsers per surface.
 *  Raise on a host with memory to spare; `COVENANT_WARM_*` is the dial. */
export const DEFAULT_WARM_READERS = 1;
export const DEFAULT_WARM_WINDOWS = 1;

/** A ceiling no environment variable can argue past, for the same reason
 *  `MAX_SESSIONS` exists: warm containers are real memory, held all the time. */
export const MAX_WARM = 4;

export interface WarmSizes {
  readonly readers: number;
  readonly windows: number;
}

export const NO_WARM: WarmSizes = { readers: 0, windows: 0 };

function sizeOf(raw: string | undefined, fallback: number): number {
  // Unset is not zero. `Number("")` is 0, which is finite and not negative, so
  // reading the fallback off the parsed number alone turned "nobody said" into
  // "keep none" and quietly switched the pools off on a host with no env file.
  if (raw === undefined || raw.trim() === "") return fallback;
  const asked = Number(raw);
  if (!Number.isFinite(asked) || asked < 0) return fallback;
  return Math.min(Math.floor(asked), MAX_WARM);
}

export function warmSizesFrom(env: NodeJS.ProcessEnv): WarmSizes {
  return {
    readers: sizeOf(env["COVENANT_WARM_READERS"], DEFAULT_WARM_READERS),
    windows: sizeOf(env["COVENANT_WARM_WINDOWS"], DEFAULT_WARM_WINDOWS),
  };
}

/**
 * What the warm pools take out of this machine's sandbox budget.
 *
 * DECISION: reserved, not added on top. A warm container holds a real
 * `--memory 1024m` entitlement whether or not anyone has claimed it, so a cap
 * that ignored them would promise the queue windows this host cannot open. The
 * queue's sentence says a number; the number has to be true.
 */
export function warmReserved(sizes: WarmSizes): number {
  return sizes.readers + sizes.windows;
}
