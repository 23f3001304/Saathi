// The purchase runner over a real working-context recorder, with everything a
// conversational turn must not touch wired to throw. Shared by the context
// tests the way `turn-harness.ts` is shared by the turn-shape tests.
import { WebFindings } from "../../src/browser/web-listing.js";
import { WebProgress } from "../../src/browser/web-progress.js";
import { BeatHub } from "../../src/http/beat-hub.js";
import { LastProposal } from "../../src/purchase/last-proposal.js";
import { PendingDraft } from "../../src/purchase/pending-draft.js";
import { ConfirmationGate } from "../../src/purchase/confirmation-gate.js";
import type { ContextLog } from "../../src/purchase/context-log.js";
import { ContextRecorder } from "../../src/purchase/context-record.js";
import { ToolLog } from "../../src/purchase/tool-log.js";
import { TurnLanguage } from "../../src/purchase/turn-language.js";
import { WebOffered } from "../../src/purchase/web-offered.js";
import { WebPickPark } from "../../src/purchase/web-pick-park.js";
import { RecordingLogger, SeqIds, SilentLogger, StepClock } from "./fakes.js";
import { forbidden, RecordingConversation } from "./turn-harness.js";

/** The durable table, as a map: same contract, no file. */
export function mapLog(): ContextLog & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    load: (chat) => rows.get(chat) ?? null,
    save: (chat, json) => void rows.set(chat, json),
    close: () => undefined,
  };
}

export const RUN_CONFIG = {
  userId: "usr_1",
  tenantId: "tnt_demo",
  merchantIss: "mrc_1",
  agentInstanceId: "agi_1",
  retrieveLimit: 8,
};

/** A recorder over real in-memory tables, so a test's record is composed the
 *  way a live run's is: from what the tables actually hold. */
export function recorderRig(log = mapLog()) {
  const offered = new WebOffered();
  const findings = new WebFindings();
  const park = new WebPickPark();
  const progress = new WebProgress();
  const recorder = new ContextRecorder(
    log,
    { offered, park, progress, findings },
    new SilentLogger(),
  );
  return { offered, findings, park, progress, recorder, log };
}

/** Every part a conversational turn must not reach, plus the quiet plumbing. */
export function stillParts() {
  return {
    conversation: new RecordingConversation(),
    traits: { recall: async () => [], remember: async () => true },
    webLook: forbidden("webLook"),
    webPick: { parked: false, resume: forbidden(""), buy: forbidden("") },
    sandbox: { retire: async () => false },
    merchantId: "kolam-run",
    intents: forbidden("intents"),
    buyer: forbidden("buyer"),
    fallback: forbidden("fallback"),
    log: new ToolLog(),
    gateway: forbidden("gateway"),
    carts: forbidden("carts"),
    settlement: forbidden("settlement"),
    hub: new BeatHub(new StepClock(), new RecordingLogger()),
    narrator: forbidden("narrator"),
    cartGate: new ConfirmationGate(true),
    lastProposal: new LastProposal(),
    pending: new PendingDraft(),
    shelf: { open: async () => [], current: () => [] },
    quotes: { newRun: () => undefined },
    logger: new SilentLogger(),
    ids: new SeqIds(),
    language: new TurnLanguage(),
  };
}
