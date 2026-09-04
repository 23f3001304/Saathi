// The transcript's own vocabulary, in a module both the fold and the draft
// folding can import. It lives apart from `assistantState.ts` so the two do
// not have to import each other to agree on what a chat entry is.
import type { Activity } from "./assistantScript.ts";

/** A draft is `live` while fragments arrive and `final` once the model has
 *  stopped; a `final` draft is still the one the next spoken beat replaces. */
export type DraftPhase = "live" | "final";

export type ChatEntry =
  | {
      kind: "agent";
      text: string;
      system?: boolean;
      /** The agent working rather than answering: collapsed by default. */
      thinking?: boolean;
      /** Present while this bubble is a streamed answer; see draftEntries.ts. */
      streamId?: string;
      draft?: DraftPhase;
    }
  | { kind: "buyer"; text: string }
  | { kind: "work"; activities: Activity[]; done: boolean }
  | { kind: "offer" }
  /** A set of options that a newer set replaced. The rows themselves are gone
   *  — one live option set is the rule — but the fact that they were weighed
   *  is part of the record, so it collapses to a line rather than vanishing. */
  | { kind: "folded"; considered: number };
