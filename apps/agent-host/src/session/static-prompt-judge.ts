import type { ShelfView } from "@covenant/agents";
import { INTENT_DRAFT_PROMPT_ID } from "@covenant/agents";
import type {
  PromptInput,
  PromptJudge,
  ResponseSchema,
} from "@covenant/domain";

import { matchedSku, NothingStocked } from "./catalog-match.js";
import type { DraftPlanConfig } from "../judge/draft-plan.js";
import { draftFieldsFor } from "../judge/draft-plan.js";

function conversationOf(input: PromptInput): string {
  const value = input["conversation"];
  return Array.isArray(value)
    ? value
        .filter((line): line is string => typeof line === "string")
        .join("\n")
    : "";
}

/**
 * The scripted mode's drafter, which is the fake model reading the sentence.
 * The model's job is to *say* what the bounds are and why, and this decides
 * what they are. That ordering is deliberate — a draft the user is about to
 * sign must not differ between two runs of the same sentence, and a sampled
 * bound is a bound whose value nobody can predict before the signing sheet
 * renders it.
 */
export class StaticPromptJudge implements PromptJudge {
  constructor(
    private readonly shelf: ShelfView,
    private readonly config: DraftPlanConfig,
  ) {}

  /** No `options`: nothing here is timed out, because nothing here waits. */
  judge<T>(
    promptId: string,
    input: PromptInput,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    if (promptId !== INTENT_DRAFT_PROMPT_ID) {
      return Promise.reject(
        new Error(`agent-host has no sealed prompt "${promptId}"`),
      );
    }
    const request = conversationOf(input);
    const sku = matchedSku(this.shelf.current(), request);
    if (sku === null) {
      // Not a fault: the shop has nothing to name, so there is no draft to
      // make. It rejects with the refusal itself rather than reaching for the
      // nearest row, so the turn can be answered as the non-purchase it is.
      return Promise.reject(new NothingStocked(request));
    }
    return Promise.resolve(schema(draftFieldsFor(request, sku, this.config)));
  }
}
