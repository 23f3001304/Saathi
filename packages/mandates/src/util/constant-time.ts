import { timingSafeEqual } from "node:crypto";

/**
 * Length check first, then a constant-time compare on equal-length buffers
 * (§8.4 check 3): no prefix match, no `startsWith`, no version parsing, and no
 * timing signal that leaks how much of a pinned URI a caller guessed right.
 */
export function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}
