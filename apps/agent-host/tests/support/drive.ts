import type { PurchaseResult } from "../../src/purchase/purchase-result.js";
import type { ChatBeat } from "../../src/http/chat-beat.js";
import type { Harness } from "./harness.js";

const POLL_MS = 50;

const RUN_TIMEOUT_MS = 60_000;

export interface ChatState {
  readonly result: PurchaseResult | null;
  readonly beats: readonly ChatBeat[];
  readonly awaiting: readonly string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

async function state(harness: Harness): Promise<ChatState> {
  const response = await fetch(`${harness.host.url}/chat/state`);
  return (await response.json()) as ChatState;
}

/**
 * Drives one purchase entirely over HTTP — `POST /chat`, then the same
 * `GET /chat/state` poll a browser would run — so the test exercises the
 * transport a judge will use rather than reaching into the composition root.
 */
export async function purchase(
  harness: Harness,
  message: string,
): Promise<ChatState> {
  const started = await fetch(`${harness.host.url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (started.status !== 202) {
    throw new Error(`POST /chat → ${started.status}`);
  }
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await state(harness);
    if (current.result !== null && current.result.status !== "running") {
      return current;
    }
    await sleep(POLL_MS);
  }
  throw new Error("the purchase never left `running`");
}

export function beatKinds(beats: readonly ChatBeat[]): readonly string[] {
  return beats.map((beat) => beat.kind);
}

export function messagesIn(beats: readonly ChatBeat[]): readonly string[] {
  return beats
    .filter((beat): beat is Extract<ChatBeat, { kind: "message" }> =>
      beat.kind === "message",
    )
    .map((beat) => beat.text);
}
