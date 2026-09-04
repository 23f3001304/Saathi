import { describe, expect, it } from "vitest";

import { WarmContainers } from "../src/container/warm-pool.js";

interface Fake {
  readonly serial: number;
  retired: boolean;
}

/**
 * A container can go without asking: its own TTL fires, the daemon restarts,
 * or something reaps by label - `reapOrphans` ends every sandbox container on
 * the machine, so a test suite run beside a live agent-host takes that host's
 * warm pool with it. `alive` is how the pool finds out.
 */
function poolOver(dead: Set<number>, size: number) {
  let serial = 0;
  const started: Fake[] = [];
  const pool = new WarmContainers<Fake>({
    size,
    maxAgeMs: 300_000,
    start: () => {
      serial += 1;
      const made: Fake = { serial, retired: false };
      started.push(made);
      return Promise.resolve(made);
    },
    retire: (held) => {
      held.retired = true;
      return Promise.resolve();
    },
    alive: (held) => !dead.has(held.serial),
    now: () => 0,
  });
  return { pool, started };
}

describe("a warm container that went away without asking", () => {
  it("is dropped rather than handed to the next claimant", async () => {
    // The first one is reaped underneath the pool, exactly as `reapOrphans`
    // reaps by label: the object is still held, the container is not there.
    const { pool, started } = poolOver(new Set([1]), 1);
    pool.prime();
    await pool.settle();
    const claimed = await pool.claim();
    expect(claimed.serial).not.toBe(1);
    expect(started[0]?.retired).toBe(true);
    await pool.drain();
  });

  it("refills after one is lost, rather than believing it still holds it", async () => {
    const dead = new Set<number>();
    const { pool } = poolOver(dead, 2);
    pool.prime();
    await pool.settle();
    expect(pool.ready).toBe(2);
    dead.add(1);
    dead.add(2);
    pool.sweep();
    await pool.settle();
    expect(pool.ready).toBe(2);
  });
});
