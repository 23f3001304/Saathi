/**
 * Smaller than the package default. Every frame is decoded, painted and
 * re-encoded twice a second, and the cost of that is linear in pixels - a
 * window the user can read beats a window nobody can stream.
 *
 * Its own file because the warm pool has to be primed with exactly this shape
 * and the plan cannot import the factory that used to hold it.
 */
export const SANDBOX_WINDOW = { width: 1024, height: 720 } as const;
