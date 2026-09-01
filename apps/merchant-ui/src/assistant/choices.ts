import { splitCopy } from "../listings/productUrl.ts";
import type { MerchantItemView } from "../api/merchantTypes.ts";
import type { ToolCall } from "./intents.ts";
import type { Choice, ChoiceOption, PartialTurn } from "./turn.ts";

// Asking the shopkeeper to choose, in a way they can answer.
//
// DECISION: a choice is options, not a sentence listing them. This file used to
// be one line of `join(" · ")`, which asked a question the interface gave no
// way to answer: the shopkeeper typed "yes", nothing matched, and the thread
// reset. Options carry ids, so a tap needs no interpretation at all, and the
// typed answer only has to fall back on naming one.

function optionFor(item: MerchantItemView): ChoiceOption {
  return {
    id: item.itemId,
    name: item.name,
    amountPaise: item.amountPaise,
    imageUrl: splitCopy(item.description).imageUrl,
    active: item.active,
  };
}

export function choiceOf(
  call: ToolCall,
  items: readonly MerchantItemView[],
): Choice {
  return { tool: call.tool, args: call.args, options: items.map(optionFor) };
}

/** Words long enough to name one listing rather than any listing. */
function words(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 3);
}

/** The option a sentence names, when it names exactly one. */
export function optionNamed(
  options: readonly ChoiceOption[],
  text: string,
): ChoiceOption | null {
  const lowered = text.toLowerCase();
  const hits = options.filter((option) =>
    words(option.name).some((word) => lowered.includes(word)),
  );
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

/** The same question again, with everything it already understood intact. */
export function reoffer(choice: Choice, said: string): PartialTurn {
  return {
    tool: choice.tool,
    said,
    did: [],
    panel: { kind: "choice", choice },
  };
}
