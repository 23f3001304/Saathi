import { AMEND_TOOL, BUYER_TOOL_SERVER } from "../src/buyer/turn-plan.js";
import type { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";

/** The covenant this shopper has actually signed: ₹2,000 a purchase. */
export const SIGNED_CAP_PAISE = 200_000;

export function amend(
  changes: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    reply: "I can put that up for you to sign.",
    summary: "Cap apparel at ₹3,000",
    changes,
  };
}

export function change(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    rule: "max_amount",
    scope: null,
    from: SIGNED_CAP_PAISE,
    to: 100_000,
    unit: null,
    currency: null,
    ...over,
  };
}

export async function planFrom(
  collector: TurnPlanCollector,
  args: Record<string, unknown>,
) {
  const outcome = await collector.dispatch({
    tool: AMEND_TOOL,
    server: BUYER_TOOL_SERVER,
    args,
  });
  return { outcome, plan: collector.take() };
}
