import type { DraftFields } from "../listings/itemDraft.ts";
import type { ShopData } from "../data/useShopData.ts";

/**
 * A proposal is a draft act, not an act. It carries the exact fields a write
 * would carry, so the merchant reads the change they are about to sign rather
 * than a description of it — the same shape as the shopper's hold-to-sign on a
 * cart, and the same guarantee: the model proposes, the signature commits.
 */
export type Proposal =
  | { kind: "create"; draft: DraftFields }
  | { kind: "edit"; itemId: string; itemName: string; draft: DraftFields };

/** One thing the shopkeeper can tap, drawn as an option row. */
export type ChoiceOption = {
  readonly id: string;
  readonly name: string;
  readonly amountPaise: number;
  readonly imageUrl: string | null;
  readonly active: boolean;
};

/**
 * A question the agent asked that the thread can answer by tapping. `tool` and
 * `args` are what the sentence was already understood to want, so answering
 * resumes that request rather than starting a new one — and a question with
 * nothing to tap is not a question, it is a dead end.
 */
export type Choice = {
  readonly tool: string;
  readonly args: Readonly<Record<string, string>>;
  readonly options: readonly ChoiceOption[];
};

/**
 * What the interface renders for a turn. Structured data is a component, never
 * a paragraph describing one — the rule the shopper's app follows when it puts
 * an option set or a bill in the thread instead of writing it out in words.
 */
export type TurnPanel =
  | { kind: "choice"; choice: Choice }
  | { kind: "briefing" }
  | { kind: "standing" }
  | { kind: "listings" }
  | { kind: "audit" }
  | { kind: "demand" }
  | { kind: "leakage" }
  | { kind: "cooloff" }
  | { kind: "orders" }
  | { kind: "editor"; proposal: Proposal };

/**
 * One turn. `said` is prose, and it is one sentence; `did` is what the agent
 * read, drawn as activity pills; `panel` is the thing itself. Keeping them
 * three fields is what stops a figure being authored into a sentence.
 */
export type Turn = {
  readonly id: number;
  readonly asked: string;
  readonly tool: string | null;
  readonly said: string;
  readonly did: readonly string[];
  readonly panel: TurnPanel | null;
};

export type TurnContext = {
  readonly data: ShopData;
  readonly shopSlug: string;
  readonly now: Date;
  /**
   * The choice the last turn offered, still unanswered. A sentence that lands
   * here is read as an answer to it first, and a sentence that answers nothing
   * gets the same question again — never the opening greeting, which mid-thread
   * reads as the agent having forgotten what was being discussed.
   */
  readonly pending: Choice | null;
};

export type PartialTurn = Omit<Turn, "id" | "asked">;
