// The words, beside the shelf `sessionStore.ts` keeps. A conversation that
// vanishes on reload reads as a product that lost your afternoon.
//
// DECISION: a restored turn is a `Turn`, and the thread renders it through the
// same list and the same `TurnPanel` as a live one. There is no second path for
// replayed turns — two paths drift, and only one of them gets tested.
//
// What comes back is the sentence, the reads it named and *which* panel it
// showed — never the panel's figures. A briefing restored from last night
// re-reads the shop this morning, so no number on this screen is one that was
// only true once. Storage is untrusted input: anything that does not parse as a
// turn is dropped rather than rendered.
import type { DraftFields } from "../listings/itemDraft.ts";
import type {
  ChoiceOption,
  Proposal,
  Turn,
  TurnPanel,
} from "../assistant/turn.ts";

const PREFIX = "covenant-shop-chat:";

/** Panels holding no data of their own: they re-read the shop when drawn. */
const VIEW_PANELS: readonly TurnPanel[] = [
  { kind: "briefing" },
  { kind: "standing" },
  { kind: "listings" },
  { kind: "audit" },
  { kind: "demand" },
  { kind: "leakage" },
  { kind: "cooloff" },
  { kind: "orders" },
];

function fields(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function draftOf(value: unknown): DraftFields | null {
  const row = fields(value);
  if (row === null) return null;
  return {
    name: text(row["name"]),
    description: text(row["description"]),
    productUrl: text(row["productUrl"]),
    imageUrl: text(row["imageUrl"]),
    rupees: text(row["rupees"]),
    floorRupees: text(row["floorRupees"]),
    active: row["active"] !== false,
  };
}

function proposalOf(value: unknown): Proposal | null {
  const row = fields(value);
  const draft = draftOf(row?.["draft"]);
  if (row === null || draft === null) return null;
  if (row["kind"] === "create") return { kind: "create", draft };
  const itemId = row["itemId"];
  const itemName = row["itemName"];
  if (typeof itemId !== "string" || typeof itemName !== "string") return null;
  return { kind: "edit", itemId, itemName, draft };
}

function optionOf(value: unknown): ChoiceOption | null {
  const row = fields(value);
  if (row === null) return null;
  const id = row["id"];
  const name = row["name"];
  const amountPaise = row["amountPaise"];
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof amountPaise !== "number") return null;
  const imageUrl = row["imageUrl"];
  return {
    id,
    name,
    amountPaise,
    imageUrl: typeof imageUrl === "string" ? imageUrl : null,
    active: row["active"] !== false,
  };
}

function args(value: unknown): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, held] of Object.entries(fields(value) ?? {})) {
    if (typeof held === "string") kept[key] = held;
  }
  return kept;
}

function choicePanel(value: unknown): TurnPanel | null {
  const row = fields(value);
  const tool = row?.["tool"];
  if (row === null || typeof tool !== "string") return null;
  const options = (Array.isArray(row["options"]) ? row["options"] : [])
    .map(optionOf)
    .filter((option): option is ChoiceOption => option !== null);
  if (options.length === 0) return null;
  return { kind: "choice", choice: { tool, args: args(row["args"]), options } };
}

/** A panel this build cannot draw loses the panel, never the words. */
function panelOf(value: unknown): TurnPanel | null {
  const row = fields(value);
  const kind = row?.["kind"];
  if (row === null || typeof kind !== "string") return null;
  if (kind === "choice") return choicePanel(row["choice"]);
  if (kind !== "editor") {
    return VIEW_PANELS.find((panel) => panel.kind === kind) ?? null;
  }
  const proposal = proposalOf(row["proposal"]);
  return proposal === null ? null : { kind: "editor", proposal };
}

function turnOf(value: unknown, id: number): Turn | null {
  const row = fields(value);
  if (row === null) return null;
  if (typeof row["asked"] !== "string" || typeof row["said"] !== "string") {
    return null;
  }
  return {
    id,
    asked: row["asked"],
    tool: typeof row["tool"] === "string" ? row["tool"] : null,
    said: row["said"],
    did: strings(row["did"]),
    panel: panelOf(row["panel"]),
  };
}

export function readTurns(conversationId: string | null): Turn[] {
  if (conversationId === null) return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + conversationId);
    const held: unknown = raw === null ? null : JSON.parse(raw);
    if (!Array.isArray(held)) return [];
    return held
      .map((row, index) => turnOf(row, index))
      .filter((turn): turn is Turn => turn !== null);
  } catch {
    return [];
  }
}

export function writeTurns(
  conversationId: string | null,
  turns: readonly Turn[],
): void {
  if (conversationId === null) return;
  try {
    window.localStorage.setItem(PREFIX + conversationId, JSON.stringify(turns));
  } catch {
    // A transcript is not worth a thrown render.
  }
}

export function forgetTurns(conversationId: string | null): void {
  if (conversationId === null) return;
  try {
    window.localStorage.removeItem(PREFIX + conversationId);
  } catch {
    // The chat is gone from the shelf either way.
  }
}
