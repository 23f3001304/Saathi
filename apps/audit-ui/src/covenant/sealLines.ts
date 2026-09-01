// Every kind of unsigned change on the Rules screen, flattened into the one
// bill the signing sheet reads. It lives beside the sheet rather than inside
// the screen because there must be exactly one answer to "what am I signing" —
// a screen that counted its pending changes one way and billed them another
// would be a screen whose count nobody could check.
import type { Constraint } from "../api/types.ts";
import { paise } from "../primitives/formatMoney.ts";
import type { PendingAmendment } from "./amendmentModel.ts";
import { amendmentLines } from "./amendmentModel.ts";
import { formatConstraintValue } from "./formatConstraintValue.ts";

export type CooloffDraft = { thresholdPaise?: string; durationHours?: string };

export type ScopeDraft = { merchants: string[]; skus: string[] };

export type SealLine = { label: string; value: string };

export type CovenantDrafts = {
  constraints: Constraint[];
  added: Constraint[];
  envCaps: Record<string, string>;
  cooloff: CooloffDraft;
  scopeAdds: ScopeDraft;
  /** Amendments the agent proposed in conversation. The same pending set. */
  proposed: readonly PendingAmendment[];
};

export function withAmendments(
  constraints: Constraint[],
  amendments: Record<string, string>,
): Constraint[] {
  return constraints.map((c) =>
    amendments[c.key] !== undefined
      ? { ...c, value: amendments[c.key], amended: true }
      : c,
  );
}

function cooloffLines(cooloff: CooloffDraft): SealLine[] {
  const lines: SealLine[] = [];
  if (cooloff.thresholdPaise !== undefined) {
    lines.push({
      label: "Cool-off above",
      value: paise(Number(cooloff.thresholdPaise)),
    });
  }
  if (cooloff.durationHours !== undefined) {
    lines.push({
      label: "Cool-off wait",
      value: `${cooloff.durationHours} hours`,
    });
  }
  return lines;
}

export function sealLines(drafts: CovenantDrafts): SealLine[] {
  return [
    ...drafts.proposed.flatMap(amendmentLines),
    ...drafts.constraints
      .filter((c) => c.amended)
      .map((c) => ({ label: c.label, value: formatConstraintValue(c) })),
    ...drafts.added.map((c) => ({
      label: `New: ${c.label}`,
      value: formatConstraintValue(c),
    })),
    ...Object.entries(drafts.envCaps).map(([category, cap]) => ({
      label: `${category} budget`,
      value: paise(Number(cap)),
    })),
    ...cooloffLines(drafts.cooloff),
    ...drafts.scopeAdds.merchants.map((m) => ({
      label: "Allow merchant",
      value: m,
    })),
    ...drafts.scopeAdds.skus.map((s) => ({ label: "Allow product", value: s })),
  ];
}
