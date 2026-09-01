import type {
  BrowserSession,
  PageControlDom,
  Refusal,
  Waiter,
} from "@covenant/browser-drive";
import { deliverySlotOf } from "@covenant/browser-drive";

import { settledRead } from "./settled-read.js";
import type { WebResult } from "./web-result.js";
import { webFailure, webOk } from "./web-result.js";

/** One durable fact the shopper stated about themselves. */
export interface AddressFact {
  readonly key: string;
  readonly value: string;
}

/**
 * Where a typed character may come from, and the only place: trait memory —
 * what the shopper said about themselves, written at P1 like everything else
 * they say. Not the model, which would be the agent inventing a person's home,
 * and not the page, which would be a foreign document filling its own form.
 */
export interface KnownAddress {
  lookup(): Promise<readonly AddressFact[]>;
}

/**
 * DECISION: the slot table lives in `@covenant/browser-drive`'s
 * `field/delivery.ts`, beside the classifier that also reads it. The classifier
 * decides a box on a checkout page is an address rather than an unrecognised
 * field; this decides which stated trait goes in it. Two tables would mean the
 * classifier could permit a field this filled with the wrong thing.
 */
function fieldSlot(control: PageControlDom): string | null {
  if (control.kind !== "field") return null;
  return deliverySlotOf(`${control.text} ${control.selector}`);
}

/** One field per slot: the first box that asks for a thing is the one filled. */
function addressFields(
  controls: readonly PageControlDom[],
): readonly (readonly [string, PageControlDom])[] {
  const seen = new Set<string>();
  const found: (readonly [string, PageControlDom])[] = [];
  for (const control of controls) {
    const slot = fieldSlot(control);
    if (slot !== null && !seen.has(slot)) {
      seen.add(slot);
      found.push([slot, control]);
    }
  }
  return found;
}

type Attempt =
  | { readonly done: "filled" | "already" }
  | { readonly done: "refused"; readonly refusal: Refusal };

/** A box the page already filled is left alone: `type` appends at the cursor,
 *  so re-typing a prefilled city produces "BengaluruBengaluru". */
async function attemptFill(
  session: BrowserSession,
  field: PageControlDom,
  value: string,
): Promise<Attempt> {
  const page = session.page();
  const present = await page.readValue(field.selector);
  if (present.ok && present.value.trim().length > 0) {
    return { done: "already" };
  }
  const typed = await page.type(field.selector, value);
  return typed.ok ? { done: "filled" } : { done: "refused", refusal: typed };
}

interface Report {
  readonly filled: string[];
  readonly already: string[];
  readonly unknown: string[];
}

function sentence(report: Report): string {
  const done = [...report.filled, ...report.already];
  if (report.unknown.length === 0 && done.length > 0) {
    return "The delivery form is filled from what they have told me. The payment step is still theirs.";
  }
  if (done.length === 0) {
    return "I have not been told an address, so I have left this form empty. Ask them for it, or say plainly that filling it in the window is theirs to do.";
  }
  return `I filled ${done.join(", ")} from what they have told me. Nobody has told me their ${report.unknown.join(", ")}, so those are still empty and still theirs.`;
}

/**
 * Fills a delivery form from trait memory alone, and stops at the first thing
 * the classifier refuses — which on a payment page is every box on it, and is
 * the handoff rather than a failure.
 */
export async function fillKnownAddress(
  session: BrowserSession,
  known: KnownAddress,
  waiter: Waiter,
  onFilled: (slots: readonly string[]) => void = () => undefined,
): Promise<WebResult> {
  const dom = await settledRead(session, waiter);
  const wanted = addressFields(dom.controls);
  if (wanted.length === 0) {
    return webFailure(
      "no_address_form",
      "There is no delivery form on this page. Read it again, or go on to the step that asks for one.",
    );
  }
  const facts = await known.lookup();
  const report: Report = { filled: [], already: [], unknown: [] };
  for (const [slot, field] of wanted) {
    const fact = facts.find(
      (candidate) => deliverySlotOf(candidate.key) === slot,
    );
    if (fact === undefined) {
      report.unknown.push(slot);
      continue;
    }
    const attempt = await attemptFill(session, field, fact.value);
    if (attempt.done === "refused") {
      return refused(report, slot, attempt.refusal);
    }
    report[attempt.done].push(slot);
  }
  onFilled([...report.filled, ...report.already]);
  return webOk({ ...report, human: sentence(report) });
}

function refused(report: Report, slot: string, refusal: Refusal): WebResult {
  return webFailure(refusal.reason, refusal.human, {
    ...report,
    stopped_at: slot,
    rule: refusal.rule,
    category: refusal.category,
    handed_to_user: refusal.handoff !== null,
    handoff_reason: refusal.handoffReason,
  });
}
