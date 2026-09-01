// The lane cap over real HTTP. `COVENANT_DOCKER_MEM_MB=4096` leaves the
// derived sandbox cap at its floor, which pins the lane cap to exactly one —
// so the second conversation MUST queue, and must be told its place honestly
// rather than being merged into the first lane or refused.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./support/harness.js";
import { boot, teardown } from "./support/harness.js";

const FIRST = "cnv_line_first";
const SECOND = "cnv_line_second";

interface Accepted {
  readonly ok: boolean;
  readonly status: string;
  readonly position?: number;
  readonly human?: string;
}

interface LaneList {
  readonly cap: number;
  readonly lanes: readonly {
    readonly conversation: string | null;
    readonly running: boolean;
    readonly queued: number | null;
  }[];
}

let harness: Harness;
let second: Accepted;
let lanesWhileQueued: LaneList;

async function begin(chat: string, message: string): Promise<Accepted> {
  const res = await fetch(`${harness.host.url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, conversation_id: chat }),
  });
  expect(res.status).toBe(202);
  return (await res.json()) as Accepted;
}

async function settled(chat: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${harness.host.url}/chat/state?conversation=${chat}`,
    );
    const body = (await res.json()) as {
      result: { status: string } | null;
    };
    if (body.result !== null && body.result.status !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`the ${chat} run never settled`);
}

beforeAll(async () => {
  // Read at boot by `wireBrowserRegistry`; the memory term bottoms out at a
  // cap of one, so `laneCapFor` is one whatever machine runs this file.
  process.env["COVENANT_DOCKER_MEM_MB"] = "4096";
  harness = await boot();
  const first = await begin(
    FIRST,
    "A navy kurta under 2000 rupees, refundable.",
  );
  expect(first.status).toBe("running");
  second = await begin(
    SECOND,
    "A pair of road running shoes under 2500, refundable, from Kolam Run.",
  );
  const res = await fetch(`${harness.host.url}/chat/lanes`);
  lanesWhileQueued = (await res.json()) as LaneList;
}, 180_000);

afterAll(async () => {
  delete process.env["COVENANT_DOCKER_MEM_MB"];
  await teardown(harness);
});

describe("the one-lane machine", () => {
  it("queues the second conversation and says where it stands", () => {
    expect(second.ok).toBe(true);
    expect(second.status).toBe("queued");
    expect(second.position).toBe(1);
    expect(second.human).toContain("number 1 in line");
  });

  it("shows the queued lane on the lane list", () => {
    expect(lanesWhileQueued.cap).toBe(1);
    const row = lanesWhileQueued.lanes.find(
      (lane) => lane.conversation === SECOND,
    );
    expect(row?.queued).toBe(1);
    expect(row?.running).toBe(false);
  });

  it("starts the queued conversation by itself once the first settles", async () => {
    await settled(FIRST);
    await settled(SECOND);
  }, 120_000);
});
