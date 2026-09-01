import { draftOf, rupeesFromPaise } from "../listings/itemDraft.ts";
import type { DraftFields } from "../listings/itemDraft.ts";
import type { MerchantItemView } from "../api/merchantTypes.ts";
import { choiceOf, optionNamed, reoffer } from "./choices.ts";
import type { ToolCall } from "./intents.ts";
import { toolNamed } from "./tools.ts";
import type { Choice, PartialTurn, TurnContext } from "./turn.ts";

type Args = Readonly<Record<string, string>>;

// The agent proposes; the merchant signs. Nothing here sends a request: each
// function returns a draft, the thread renders it in the real editor, and the
// signature is the only thing that commits it.

function need(tool: string, said: string): PartialTurn {
  return { tool, said, did: [], panel: null };
}

function priceOf(args: Args): number | null {
  const raw = args["amount_paise"];
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function proposeCreate(call: ToolCall): PartialTurn {
  const name = call.args["name"] ?? "";
  if (name === "") {
    return need("listing.propose_create", "What should I list?");
  }
  const amountPaise = priceOf(call.args);
  if (amountPaise === null) {
    return need(
      "listing.propose_create",
      `I have "${name}" but no price — say it as "at 1899".`,
    );
  }
  return {
    tool: "listing.propose_create",
    said: "Drafted. Nothing is listed until you sign it.",
    did: [toolNamed("listing.propose_create")?.reads ?? ""],
    panel: {
      kind: "editor",
      proposal: {
        kind: "create",
        draft: {
          name,
          description: "",
          productUrl: call.args["product_url"] ?? "",
          imageUrl: "",
          rupees: rupeesFromPaise(amountPaise),
          floorRupees: "",
          active: true,
        },
      },
    },
  };
}

function patched(
  draft: DraftFields,
  args: Args,
  amountPaise: number | null,
): DraftFields {
  return {
    ...draft,
    rupees: amountPaise === null ? draft.rupees : rupeesFromPaise(amountPaise),
    productUrl: args["product_url"] ?? draft.productUrl,
    active: args["active"] === "false" ? false : draft.active,
  };
}

function editTurn(item: MerchantItemView, args: Args): PartialTurn {
  return {
    tool: "listing.propose_edit",
    said: `Drafted a change to ${item.name}. Nothing changes until you sign it.`,
    did: [toolNamed("listing.propose_edit")?.reads ?? ""],
    panel: {
      kind: "editor",
      proposal: {
        kind: "edit",
        itemId: item.itemId,
        itemName: item.name,
        draft: patched(draftOf(item), args, priceOf(args)),
      },
    },
  };
}

export function proposeEdit(
  call: ToolCall,
  context: TurnContext,
  asked: string,
): PartialTurn {
  const items = context.data.shelf.data?.items ?? [];
  if (items.length === 0) {
    return need(
      "listing.propose_edit",
      "There is nothing on your shelf to change yet.",
    );
  }
  const choice = choiceOf(call, items);
  const named = optionNamed(choice.options, asked);
  if (named === null) {
    return reoffer(choice, "Which one shall I change?");
  }
  return resolveChoice(choice, named.id, context);
}

/** Answering a choice: the id names the listing, so nothing is interpreted. */
export function resolveChoice(
  choice: Choice,
  optionId: string,
  context: TurnContext,
): PartialTurn {
  const items = context.data.shelf.data?.items ?? [];
  const item = items.find((row) => row.itemId === optionId);
  if (item === undefined) {
    return reoffer(choice, "That one has left your shelf. Which of these?");
  }
  return editTurn(item, choice.args);
}
