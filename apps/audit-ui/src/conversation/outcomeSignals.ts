// The outcome beat, folded on its own: it ends the run, may carry the
// settlement id, and is the one place a raw state enum could reach a bubble,
// so its mapping earns a file. Split from beatSignals.ts at the size limit.
import type { AgentBeat } from "../api/agentBeat.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import { OUTCOME_TEXT, pill } from "./beatLines.ts";

/** A conversational turn has no outcome to report: the reply *is* the outcome.
 *  An unmapped state is never spoken either — it would put a raw enum in the
 *  agent's mouth, which is how "answered answer" reached the screen. */
export function outcomeSignals(
  beat: Extract<AgentBeat, { kind: "outcome" }>,
): AssistantSignal[] {
  if (beat.state === "answered")
    return [{ kind: "work-done" }, { kind: "run-idle" }];
  // The transaction is carried whatever the outcome reads as: a bill whose
  // link mint was refused still has an order to pay, so the card needs the id
  // even on the states that are not `link_issued`.
  const settled: AssistantSignal[] =
    beat.txnId === null ? [] : [{ kind: "settlement", txnId: beat.txnId }];
  const known = OUTCOME_TEXT[beat.state];
  if (known === undefined) {
    return [
      { kind: "work-done" },
      { kind: "run-idle" },
      ...settled,
      pill(`outcome-${beat.state}`, beat.state),
    ];
  }
  // A link_issued whose detail admits no link was minted must not open with
  // "your payment link is ready" — the sentence and its own detail disagreed
  // on camera. The bill is the truthful headline either way.
  const lead =
    beat.state === "link_issued" && beat.detail.includes("no link issued")
      ? "Your bill is ready to pay."
      : known;
  // The ids stay off the sentence: txn_ and order_ strings in a shopper
  // bubble read as a crash dump, and the Ledger already holds every one of
  // them. Detail rides along only when it says something a person acts on.
  // A failure's detail is a provider's own error string ("the operation was
  // aborted due to timeout"), which is a stack trace wearing a sentence. The
  // honest line is the one the harness wrote; the cause belongs in the log.
  const machine =
    beat.state === "failed" ||
    beat.detail.match(/^(txn_|order_|rzp_)|no link issued/) !== null;
  const spoken = machine ? lead : `${lead} ${beat.detail}`.trim();
  return [
    { kind: "work-done" },
    { kind: "run-idle" },
    ...settled,
    { kind: "say", text: spoken, system: true },
  ];
}
