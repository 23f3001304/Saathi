import type { ToolOutcome } from "../shared/agent-session.js";
import type { ToolArgs } from "../shared/tool-envelope.js";
import {
  askedBudget,
  groupsAt,
  repliesAt,
  stringsAt,
  textAt,
} from "./turn-plan-args.js";
import type { DraftBounds } from "./turn-plan-draft.js";
import { draftOf } from "./turn-plan-draft.js";
import { answeredOutcome, browsedOutcome } from "./turn-plan-guidance.js";
import type { TurnAction, TurnPlan } from "./turn-plan.js";
import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  DECLINE_TOOL,
  MAX_BROWSE_SKUS,
  PICK_TOOL,
  PROPOSE_TOOL,
  WEB_LOOK_TOOL,
} from "./turn-plan.js";

/** A move as the collector records it: the plan the turn will take and the
 *  result the model reads, or the refusal the model reads and no plan. */
export type Recorded =
  | { readonly ok: true; readonly plan: TurnPlan; readonly outcome: ToolOutcome }
  | { readonly ok: false; readonly outcome: ToolOutcome };

export function ok(recorded: string): ToolOutcome {
  return { content: JSON.stringify({ ok: true, recorded }), isError: false };
}

export function refused(
  failure: string,
  detail: Readonly<Record<string, unknown>> = {},
): ToolOutcome {
  return {
    content: JSON.stringify({ ok: false, failure, ...detail }),
    isError: true,
  };
}

/**
 * One utterance per turn, enforced here rather than left to whoever renders
 * it. The model writes its question into `reply` as well as into `question`,
 * and both were being said. A reply that already asks something is the whole
 * utterance, and the separate field, which exists so the composer can offer
 * replies, stays empty rather than becoming a second sentence.
 */
function planOf(action: TurnAction, args: ToolArgs): TurnPlan {
  const reply = textAt(args, "reply");
  const question = textAt(args, "question");
  return {
    action,
    reply,
    question: question.length > 0 && !reply.endsWith("?") ? question : null,
    replies: repliesAt(args, "replies"),
    // Budget comes last, where a form puts it: every other axis narrows what
    // the thing is, and the price is the question you answer once you know.
    choiceGroups: [...groupsAt(args), ...askedBudget(args)],
    query: textAt(args, "query") || null,
    shop: textAt(args, "shop") || null,
    amendment: null,
    traits: [],
  };
}

function skusOn(bounds: DraftBounds | null): readonly string[] | null {
  return bounds === null ? null : bounds.shelf.current().map((row) => row.sku);
}

/** The same sku named twice is one row, not two: first occurrence wins and
 *  the model's own order survives. */
function deduped(skus: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return skus.filter((sku) => {
    if (seen.has(sku)) return false;
    seen.add(sku);
    return true;
  });
}

/**
 * The model named the rows it read. A sku the shelf does not hold comes back
 * refused with the shelf attached, so the retry costs one call rather than a
 * read and a call; nothing is recorded, because a browse showing a row that
 * does not exist is the shell inventing stock.
 *
 * DECISION: the schema declares `skus` at most four, but a schema is a hint a
 * provider can ignore, not a wall. The bound the model reads is the bound
 * enforced here too, off the one constant, so a provider that hands back
 * every sku on the shelf is refused rather than carded in full.
 */
function browseRecorded(args: ToolArgs, bounds: DraftBounds | null): Recorded {
  const named = stringsAt(args, "skus");
  if (named.length === 0) {
    return { ok: false, outcome: refused("bad_arguments") };
  }
  const skus = deduped(named);
  if (skus.length > MAX_BROWSE_SKUS) {
    return {
      ok: false,
      outcome: refused("bad_arguments", {
        max_skus: MAX_BROWSE_SKUS,
        given: skus.length,
      }),
    };
  }
  const shelf = skusOn(bounds);
  const unknown =
    shelf === null ? [] : skus.filter((sku) => !shelf.includes(sku));
  if (unknown.length > 0) {
    return {
      ok: false,
      outcome: refused("sku_not_on_shelf", { unknown, shelf }),
    };
  }
  return {
    ok: true,
    plan: { ...planOf("browse", args), skus },
    outcome: browsedOutcome(skus.length),
  };
}

/** What a refused proposal carries back: the fact the model needs to try
 *  again, never a corrected number of the shell's own. */
function refusalDetail(
  failure: string,
  bounds: DraftBounds | null,
): Readonly<Record<string, unknown>> {
  if (failure === "cap_exceeded") {
    return { cap_paise: bounds?.capPaise ?? null };
  }
  if (failure === "sku_not_on_shelf") {
    return { shelf: skusOn(bounds) };
  }
  return {};
}

function proposeRecorded(args: ToolArgs, bounds: DraftBounds | null): Recorded {
  const parsed = draftOf(args, bounds);
  if (!parsed.ok) {
    return {
      ok: false,
      outcome: refused(parsed.failure, refusalDetail(parsed.failure, bounds)),
    };
  }
  return {
    ok: true,
    plan: { ...planOf("draft_intent", args), draft: parsed.draft },
    outcome: ok("draft_intent"),
  };
}

/** The host decides whether the ref is on a card; here a ref is only
 *  required to exist. */
function pickRecorded(args: ToolArgs): Recorded {
  const ref = textAt(args, "ref");
  if (ref === "") {
    return { ok: false, outcome: refused("bad_arguments") };
  }
  return {
    ok: true,
    plan: { ...planOf("pick", args), ref },
    outcome: ok("pick"),
  };
}

/** `null` for a tool that is not a move at all. */
export function movePlan(
  tool: string,
  args: ToolArgs,
  bounds: DraftBounds | null,
): Recorded | null {
  switch (tool) {
    case ANSWER_TOOL:
      return {
        ok: true,
        plan: planOf("answer", args),
        outcome: answeredOutcome(textAt(args, "blocked_by")),
      };
    case BROWSE_TOOL:
      return browseRecorded(args, bounds);
    case WEB_LOOK_TOOL:
      return {
        ok: true,
        plan: planOf("look_on_web", args),
        outcome: ok("look_on_web"),
      };
    case PROPOSE_TOOL:
      return proposeRecorded(args, bounds);
    case DECLINE_TOOL:
      return { ok: true, plan: planOf("decline", args), outcome: ok("decline") };
    case PICK_TOOL:
      return pickRecorded(args);
    default:
      return null;
  }
}
