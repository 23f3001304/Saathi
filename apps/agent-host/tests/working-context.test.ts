// The per-conversation working context: written by the shell from what it
// observed, keyed by the conversation, rehydrated after a restart, and never
// visible from any other chat — the leak this codebase has been burned by.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { openContextLog } from "../src/purchase/context-log.js";
import type { Turn } from "../src/purchase/dialogue.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { parseContext } from "../src/purchase/working-context.js";
import { mapLog, recorderRig } from "./support/context-rig.js";
import { SilentLogger, StepClock } from "./support/fakes.js";

const CHAT = "cnv_ctx_a";

const TILES = [
  {
    title: "Deal Price ₹6,199 Crucial E100 1TB Portable SSD",
    priceText: "₹6,199",
    href: "https://www.amazon.in/CRUCIAL-E100/dp/B0D1XYZ123",
    imageUrl: null,
  },
  {
    title: "SANDISK Extreme 1TB Portable SSD",
    priceText: "₹8,499",
    href: "https://www.amazon.in/SANDISK-EXT/dp/B0D2ABC456",
    imageUrl: null,
  },
];

function asked(text: string, index = 0): Turn {
  return { speaker: "user", text, at: `2026-08-31T09:00:0${index}.000Z` };
}

function researched(parts: ReturnType<typeof recorderRig>): void {
  parts.offered.claim(CHAT);
  parts.recorder.claim(CHAT);
  parts.offered.offer(parts.findings.record(TILES));
  parts.recorder.noted(emptyResult("urn:covenant:run:1", "1tb ssd"), [
    asked("find me a 1tb portable ssd under 10000"),
  ]);
}

describe("the record a research run leaves behind", () => {
  const parts = recorderRig();
  researched(parts);
  const record = parts.recorder.current();

  it("carries the options as the shell carded them, cleaned and keyed", () => {
    expect(record?.options).toHaveLength(2);
    expect(record?.options[0]?.title).toBe("Crucial E100 1TB Portable SSD");
    expect(record?.options[0]?.productKey).toBe("B0D1XYZ123");
    expect(record?.options[0]?.url).toContain("/dp/B0D1XYZ123");
  });

  it("carries their newest line as the hint of what they are after", () => {
    expect(record?.asked).toBe("find me a 1tb portable ssd under 10000");
    expect(record?.outcome?.state).toBe("running");
  });

  it("takes the last line they wrote, not a distillation of all of them", () => {
    const fresh = recorderRig();
    fresh.offered.claim(CHAT);
    fresh.recorder.claim(CHAT);
    fresh.recorder.noted(emptyResult("urn:covenant:run:2", "ok"), [
      asked("find me a 1tb portable ssd under 10000"),
      asked("the crucial one", 1),
    ]);
    expect(fresh.recorder.current()?.asked).toBe("the crucial one");
  });

  it("is durably filed under its conversation", () => {
    const saved = parseContext(parts.log.rows.get(CHAT) ?? null);
    expect(saved?.options).toHaveLength(2);
  });
});

describe("buy progress is what the host watched, not what was said", () => {
  it("records the park, the basket click and the filled slots", () => {
    const parts = recorderRig();
    researched(parts);
    const ref = parts.offered.live(CHAT)[0]?.ref ?? "";
    parts.park.hold(ref, "address");
    parts.progress.recordCarted();
    parts.progress.recordFilled(["name", "pincode"]);
    parts.recorder.noted(emptyResult(`urn:covenant:pick:${ref}`, ref), []);
    const record = parts.recorder.current();
    expect(record?.pick?.title).toBe("Crucial E100 1TB Portable SSD");
    expect(record?.progress).toEqual({
      carted: true,
      filled: ["name", "pincode"],
      stopped: "address",
    });
  });
});

describe("rehydration after a restart", () => {
  it("puts the cards back on the table, resolvable end to end", () => {
    const log = mapLog();
    researched(recorderRig(log));
    // A fresh process: empty tables, the same durable log.
    const revived = recorderRig(log);
    revived.offered.claim(CHAT);
    revived.recorder.claim(CHAT);
    const live = revived.offered.live(CHAT);
    expect(live).toHaveLength(2);
    // The cards resolve again: each ref this process minted maps to the URL
    // the earlier process recorded landing on.
    const first = live[0]?.ref ?? "";
    const url = revived.findings.find(first)?.url;
    expect(url).toContain("/dp/B0D1XYZ123");
  });
});

describe("one conversation's record never reaches another", () => {
  it("shows chat B nothing of chat A", () => {
    const log = mapLog();
    const parts = recorderRig(log);
    researched(parts);
    parts.offered.claim("cnv_ctx_b");
    parts.recorder.claim("cnv_ctx_b");
    expect(parts.recorder.current()).toBeNull();
    expect(parts.offered.live("cnv_ctx_b")).toHaveLength(0);
  });

  it("keeps a run with no conversation id out of the table entirely", () => {
    const parts = recorderRig();
    parts.offered.claim(null);
    parts.recorder.claim(null);
    parts.recorder.noted(emptyResult("urn:covenant:run:9", "hi"), []);
    expect(parts.recorder.current()).toBeNull();
    expect(parts.log.rows.size).toBe(0);
  });
});

const dir = mkdtempSync(join(tmpdir(), "covenant-ctx-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the durable table survives the process", () => {
  it("loads after a close and reopen, scoped by conversation", () => {
    const file = join(dir, "ctx.db");
    const first = openContextLog(file, new StepClock(), new SilentLogger());
    first.save(CHAT, JSON.stringify({ v: 1, options: [] }));
    first.close();
    const second = openContextLog(file, new StepClock(), new SilentLogger());
    expect(parseContext(second.load(CHAT))?.v).toBe(1);
    expect(second.load("cnv_ctx_other")).toBeNull();
    second.close();
  });
});
