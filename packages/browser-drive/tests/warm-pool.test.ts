import { describe, expect, it } from "vitest";

import { WarmContainers } from "../src/container/warm-pool.js";

interface Fake {
  readonly serial: number;
  retired: boolean;
}

/** A pool over counters rather than containers: everything this class decides
 *  is about lifetimes and counts, and none of it is about Docker. */
function poolOf(
  size: number,
  extra: Partial<{ maxAgeMs: number; now: () => number }> = {},
) {
  let serial = 0;
  const started: Fake[] = [];
  const pool = new WarmContainers<Fake>({
    size,
    maxAgeMs: extra.maxAgeMs ?? 300_000,
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
    now: extra.now ?? ((): number => 0),
  });
  return { pool, started };
}

/** The pool fills in the background; every assertion waits for it to settle. */
async function settled(pool: WarmContainers<Fake>): Promise<void> {
  await pool.settle();
}

describe("WarmContainers", () => {
  it("keeps the requested number ready without being asked", async () => {
    const { pool, started } = poolOf(2);
    pool.prime();
    await settled(pool);
    expect(started).toHaveLength(2);
    expect(pool.ready).toBe(2);
    await pool.drain();
  });

  it("hands out a warm one and starts its replacement", async () => {
    const { pool, started } = poolOf(1);
    pool.prime();
    await settled(pool);
    const claimed = await pool.claim();
    expect(claimed.serial).toBe(1);
    await settled(pool);
    expect(started).toHaveLength(2);
    expect(pool.ready).toBe(1);
    await pool.drain();
  });

  it("never hands the same container to two claimants", async () => {
    const { pool } = poolOf(3);
    pool.prime();
    await settled(pool);
    const claims = await Promise.all([
      pool.claim(),
      pool.claim(),
      pool.claim(),
    ]);
    const serials = new Set(claims.map((held) => held.serial));
    expect(serials.size).toBe(3);
    await pool.drain();
  });

});

describe("an empty warm pool", () => {
  it("starts one cold rather than making the caller wait", async () => {
    const { pool, started } = poolOf(0);
    const claimed = await pool.claim();
    expect(claimed.serial).toBe(1);
    expect(started).toHaveLength(1);
    await pool.drain();
  });

});

describe("a warm container that waited too long", () => {
  it("is retired rather than handed on", async () => {
    let clock = 0;
    const { pool, started } = poolOf(1, { maxAgeMs: 100, now: () => clock });
    pool.prime();
    await settled(pool);
    clock = 101;
    pool.sweep();
    await settled(pool);
    expect(started[0]?.retired).toBe(true);
    expect(started).toHaveLength(2);
    await pool.drain();
  });

  it("never hands out a container that is already too old", async () => {
    let clock = 0;
    const { pool, started } = poolOf(1, { maxAgeMs: 100, now: () => clock });
    pool.prime();
    await settled(pool);
    clock = 101;
    const claimed = await pool.claim();
    expect(claimed.serial).not.toBe(1);
    expect(started[0]?.retired).toBe(true);
    await pool.drain();
  });

});

describe("draining a warm pool", () => {
  it("closes everything it still holds", async () => {
    const { pool, started } = poolOf(2);
    pool.prime();
    await settled(pool);
    await pool.drain();
    expect(started.every((held) => held.retired)).toBe(true);
    expect(pool.ready).toBe(0);
  });

  it("stops refilling once drained", async () => {
    const { pool, started } = poolOf(1);
    pool.prime();
    await settled(pool);
    await pool.drain();
    pool.prime();
    await settled(pool);
    expect(started).toHaveLength(1);
  });

});

describe("a warm pool whose containers will not start", () => {
  it("survives it and tries again on the next prime", async () => {
    let attempts = 0;
    const pool = new WarmContainers<Fake>({
      size: 1,
      maxAgeMs: 300_000,
      start: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("no docker today"))
          : Promise.resolve({ serial: attempts, retired: false });
      },
      retire: () => Promise.resolve(),
      now: () => 0,
    });
    pool.prime();
    await settled(pool);
    expect(pool.ready).toBe(0);
    pool.prime();
    await settled(pool);
    expect(pool.ready).toBe(1);
    await pool.drain();
  });

  it("reports a cold start's own failure to the claimant", async () => {
    const pool = new WarmContainers<Fake>({
      size: 0,
      maxAgeMs: 300_000,
      start: () => Promise.reject(new Error("no docker today")),
      retire: () => Promise.resolve(),
      now: () => 0,
    });
    await expect(pool.claim()).rejects.toThrow("no docker today");
    await pool.drain();
  });
});
