import { briefingFor } from "../advisor/briefing.ts";
import { paise } from "../primitives/formatMoney.ts";
import { opening } from "../primitives/plural.ts";
import { committedPaise, cooloffOrders } from "../orders/orderState.ts";
import { toolNamed } from "./tools.ts";
import type { PartialTurn, TurnContext } from "./turn.ts";

// One sentence, the reads it made, and the panel itself. No answer here writes
// a figure into prose that the panel below it does not also show.

function turn(
  tool: string,
  said: string,
  panel: PartialTurn["panel"],
): PartialTurn {
  return {
    tool,
    said,
    did: [toolNamed(tool)?.reads ?? tool],
    panel,
  };
}

function costingLine(count: number): string {
  if (count === 0) return "Nothing is costing you a sale right now.";
  if (count === 1) return "One thing is costing you sales.";
  return `${count.toString()} things are costing you sales, worst first.`;
}

function briefing(context: TurnContext): PartialTurn {
  const count = briefingFor({
    standing: context.data.standing,
    audit: context.data.audit.data,
    demand: context.data.demand.data,
    leakage: context.data.leakage.data,
  }).length;
  return turn("shop.briefing", costingLine(count), { kind: "briefing" });
}

function standing(context: TurnContext): PartialTurn {
  return turn(
    "shop.standing",
    context.data.standing === null
      ? "I have not been able to read your standing yet."
      : "This is what a buyer's agent reads before it picks.",
    context.data.standing === null ? null : { kind: "standing" },
  );
}

function flaggedLine(count: number): string {
  if (count === 0) return "No listing of yours carries a line an agent flags.";
  if (count === 1) return "One of your listings carries a line an agent flags.";
  return `${count.toString()} of your listings carry a line an agent flags.`;
}

function audit(context: TurnContext): PartialTurn {
  const found = context.data.audit.data;
  const flagged = found?.listings.filter((row) => row.cues.length > 0) ?? [];
  return turn(
    "listings.audit",
    flaggedLine(flagged.length),
    found === null ? null : { kind: "audit" },
  );
}

function demand(context: TurnContext): PartialTurn {
  const unmet = context.data.demand.data?.unmet ?? [];
  return turn(
    "demand.unmet",
    unmet.length === 0
      ? "No search has come away empty here yet."
      : "These searches found nothing on your shelf.",
    { kind: "demand" },
  );
}

function cooloff(context: TurnContext): PartialTurn {
  const orders = context.data.orders.data?.orders ?? [];
  return turn(
    "orders.cooloff",
    cooloffOrders(orders).length === 0
      ? "Nothing is inside a cool-off."
      : `${paise(committedPaise(orders))} is committed and not yet money.`,
    { kind: "cooloff" },
  );
}

function orders(context: TurnContext): PartialTurn {
  const rows = context.data.orders.data?.orders ?? [];
  return turn(
    "orders.recent",
    rows.length === 0
      ? "No orders yet."
      : `${opening(rows.length, "payment record")}.`,
    { kind: "orders" },
  );
}

function leakage(context: TurnContext): PartialTurn {
  const refusals = context.data.leakage.data?.refusals ?? [];
  return turn(
    "leakage.refusals",
    refusals.length === 0
      ? "No sale has been turned down at your shop."
      : "Here is where the sales were turned down.",
    { kind: "leakage" },
  );
}

export const READ_ANSWERS: Record<
  string,
  (context: TurnContext) => PartialTurn
> = {
  "shop.briefing": briefing,
  "shop.standing": standing,
  "listings.audit": audit,
  "demand.unmet": demand,
  "orders.cooloff": cooloff,
  "orders.recent": orders,
  "leakage.refusals": leakage,
};
