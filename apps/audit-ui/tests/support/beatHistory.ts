// A host that has written its conversation down: `GET /chat/history` answers
// with beats and a cursor, `GET /chat/state` with whatever the hub holds now.
import { vi } from "vitest";

import type { SandboxSession } from "../../src/api/agentBeat.ts";

export const BASE = "http://host.invalid";
export const CHAT = "cnv_beats";
export const EPOCH = 9;

export const SANDBOX: SandboxSession = {
  id: "web_1",
  sandbox: { surface: "container", id: "cnt_9" },
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "user-drive",
  handoff: null,
  actions: [
    { id: "j1", label: "Opened amazon.in", outcome: "ok", actor: "agent" },
    {
      id: "j2",
      label: "Refused to type the password",
      outcome: "refused",
      actor: "agent",
      reason: "that is a password field",
    },
  ],
};

const OPTION = {
  id: "o1",
  sku: "KR-ROAD-42",
  title: "Kolam Road 2",
  pricePaise: 249000,
  rating: 4.4,
  deliveryDays: 3,
  merchant: "Kolam Run",
};

export interface Beat {
  readonly offsetMs: number;
  readonly kind: string;
  readonly [key: string]: unknown;
}

export interface StoredBeat {
  readonly epoch: number;
  readonly index: number;
  readonly beat: Beat;
}

export interface Host {
  readonly lines: readonly { speaker: string; text: string }[];
  readonly stored: readonly StoredBeat[];
  readonly cursor: { epoch: number; index: number } | null;
  readonly live: readonly Beat[];
  readonly running: boolean;
}

export const STORED: readonly StoredBeat[] = [
  { epoch: 0, index: 0, beat: { offsetMs: 0, kind: "buyer", text: "Shoes?" } },
  {
    epoch: EPOCH,
    index: 1,
    beat: { offsetMs: 1, kind: "message", text: "Two fit." },
  },
  {
    epoch: EPOCH,
    index: 2,
    beat: { offsetMs: 2, kind: "options", options: [OPTION] },
  },
  {
    epoch: EPOCH,
    index: 3,
    beat: {
      offsetMs: 3,
      kind: "cart",
      itemCount: 1,
      totalPaise: 249000,
      digest: "sha256:abc",
      quoteOk: true,
    },
  },
  {
    epoch: EPOCH,
    index: 4,
    beat: { offsetMs: 4, kind: "sandbox", session: SANDBOX },
  },
];

export const FINISHED: Host = {
  lines: [{ speaker: "user", text: "Shoes?" }],
  stored: STORED,
  cursor: { epoch: EPOCH, index: 4 },
  live: [],
  running: false,
};

/** Every beat the run published, as the hub would still be holding them. */
export function replayed(...extra: readonly Beat[]): readonly Beat[] {
  return [...STORED.slice(1).map((entry) => entry.beat), ...extra];
}

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function answer(host: Host, url: string, init?: RequestInit): Response {
  if (init?.method === "POST") return reply({ ok: true, run_id: "r" });
  if (url.startsWith(`${BASE}/chat/history`))
    return reply({
      ok: true,
      lines: host.lines,
      beats: host.stored,
      cursor: host.cursor,
    });
  if (url.endsWith("/chat/state"))
    return reply({
      epoch: EPOCH,
      beats: host.live,
      running: host.running,
      awaiting: [],
      // Whose run the hub is holding. These exercises are a chat rejoining its
      // own; `cross-chat-bleed.test.ts` is where it is somebody else's.
      conversation: CHAT,
    });
  throw new Error(`unexpected ${url}`);
}

export function stubHost(host: Host): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(answer(host, url, init)),
    ),
  );
}
