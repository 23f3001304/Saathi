// The durable half of the conversation: what is written down, what is refused
// a place in it, and what is thrown away so one long session cannot become an
// unbounded table.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Clock } from "@covenant/domain";

import { BeatHub } from "../src/http/beat-hub.js";
import type { BeatLog } from "../src/http/beat-log.js";
import { BEATS_PER_CONVERSATION, openBeatLog } from "../src/http/beat-log.js";
import { ConversationBeatStore } from "../src/http/beat-store.js";
import type { SandboxView } from "../src/http/chat-beat.js";
import { SilentLogger } from "./support/fakes.js";

const CHAT = "cnv_durable";

/** Frozen: retention is asserted on the row count, never on a real clock. */
class FixedClock implements Clock {
  constructor(private ms = Date.parse("2026-08-31T09:00:00.000Z")) {}
  now(): Date {
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

const SANDBOX: SandboxView = {
  id: "web_1",
  sandbox: { surface: "container", id: "cnt_9" },
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "user-drive",
  handoff: { reason: "login", ask: "Sign in yourself." },
  actions: [
    { id: "j1", label: "Opened amazon.in", outcome: "ok", actor: "agent" },
    {
      id: "j2",
      label: "Typed into #twotabsearchtextbox",
      outcome: "ok",
      actor: "agent",
    },
    {
      id: "j3",
      label: "Refused to type there",
      outcome: "refused",
      actor: "agent",
      reason: "that is a password field",
    },
  ],
};

let dir: string;
let clock: FixedClock;
let log: BeatLog;
let store: ConversationBeatStore;

function fileFor(name: string): string {
  return join(dir, `${name}.db`);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "covenant-beat-log-"));
  clock = new FixedClock();
  log = openBeatLog(fileFor("beats"), clock, new SilentLogger());
  store = new ConversationBeatStore(log, new SilentLogger());
});

afterAll(() => {
  log.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows can hold the WAL file a moment after close; the OS reaps temp.
  }
});

describe("what the log keeps", () => {
  it("files the shopper's turn ahead of the run it started", () => {
    store.open(CHAT, "An external SSD under 5000");
    store.record(4, 1, { offsetMs: 0, kind: "message", text: "Looking now." });
    const restored = store.history(CHAT);
    expect(restored.beats.map((entry) => entry.beat.kind)).toEqual([
      "buyer",
      "message",
    ]);
    expect(restored.cursor).toEqual({ epoch: 4, index: 1 });
  });

  it("keeps the sandbox's actions and no picture at all", () => {
    store.record(4, 2, { offsetMs: 1, kind: "sandbox", session: SANDBOX });
    const stored = store.history(CHAT).beats.at(-1);
    expect(stored?.beat.kind).toBe("sandbox");
    const json = JSON.stringify(stored);
    expect(json).toContain("Refused to type there");
    expect(json).not.toContain("png");
    expect(json).not.toContain("frame");
    expect(json).not.toContain("data:image");
  });
});

describe("what the log refuses a place in", () => {
  it("drops an inline image from an option row, and keeps a linked one", () => {
    store.record(4, 3, {
      offsetMs: 2,
      kind: "options",
      options: [
        row("a", "data:image/png;base64,AAAA"),
        row("b", "https://cdn.example/one.jpg"),
      ],
    });
    const beat = store.history(CHAT).beats.at(-1)?.beat;
    if (beat?.kind !== "options") throw new Error("expected an options beat");
    expect(beat.options[0]?.imageUrl).toBeUndefined();
    expect(beat.options[1]?.imageUrl).toBe("https://cdn.example/one.jpg");
  });

  it("files nothing for a run started without a conversation", () => {
    store.open(null, "no id, no home");
    store.record(4, 9, { offsetMs: 3, kind: "signing-required" });
    expect(store.history(CHAT).beats).toHaveLength(4);
  });
});

function row(id: string, imageUrl: string) {
  return {
    id,
    sku: `sku_${id}`,
    title: id,
    pricePaise: 100,
    rating: 4,
    deliveryDays: 2,
    merchant: "kolam",
    imageUrl,
  };
}

describe("the bound on one conversation", () => {
  it(`keeps the newest ${BEATS_PER_CONVERSATION} beats and drops the rest`, () => {
    const many = new ConversationBeatStore(log, new SilentLogger());
    many.open("cnv_long", "start");
    for (let i = 1; i <= BEATS_PER_CONVERSATION + 20; i += 1) {
      many.record(5, i, { offsetMs: i, kind: "message", text: `line ${i}` });
    }
    const kept = many.history("cnv_long").beats;
    expect(kept).toHaveLength(BEATS_PER_CONVERSATION);
    expect(JSON.stringify(kept)).not.toContain('line 1"');
    expect(kept.at(-1)?.index).toBe(BEATS_PER_CONVERSATION + 20);
  });
});

describe("an address that survives the process", () => {
  it("reopens past every epoch the file has ever held", () => {
    const file = fileFor("epochs");
    const first = openBeatLog(file, clock, new SilentLogger());
    const writer = new ConversationBeatStore(first, new SilentLogger());
    writer.open(CHAT, "hello");
    writer.record(7, 1, { offsetMs: 0, kind: "message", text: "hi" });
    first.close();

    const second = openBeatLog(file, clock, new SilentLogger());
    const reopened = new ConversationBeatStore(second, new SilentLogger());
    expect(reopened.startEpoch).toBe(8);
    expect(
      new BeatHub(clock, new SilentLogger(), {
        startEpoch: reopened.startEpoch,
      }).epoch,
    ).toBe(8);
    expect(reopened.history(CHAT).beats).toHaveLength(2);
    second.close();
  });

  it("forgets rows older than the retention window on the next boot", () => {
    const file = fileFor("aged");
    const early = new FixedClock(Date.parse("2026-01-01T00:00:00.000Z"));
    const first = openBeatLog(file, early, new SilentLogger());
    const writer = new ConversationBeatStore(first, new SilentLogger());
    writer.open(CHAT, "long ago");
    first.close();

    const later = openBeatLog(file, clock, new SilentLogger());
    expect(
      new ConversationBeatStore(later, new SilentLogger()).history(CHAT).beats,
    ).toHaveLength(0);
    later.close();
  });
});
