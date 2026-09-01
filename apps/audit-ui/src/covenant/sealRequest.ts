// The seal, in the gateway's units.
//
// The screen edits in the units a person reads — a cool-off in hours, an APR
// in percent — and the covenant is denominated in seconds and basis points. A
// wait shown as "24 hours" and signed as 24 seconds would be a covenant nobody
// agreed to, so the conversion happens here, once, on the way out.
import type { Constraint } from "../api/types.ts";
import type { ProposedChange } from "./amendmentModel.ts";
import type { CovenantDrafts } from "./sealLines.ts";

export type BoundEdit = {
  predicate: string;
  value: number | boolean | string;
};

export type Blackout = { tz: string; from: string; to: string };

export type SealRequest = {
  description: string;
  bounds: BoundEdit[];
  envelopes: { category: string; cap_paise: number }[];
  merchants: string[];
  skus: string[];
  blackout?: Blackout;
};

/** "23:00-06:00", in the reader's own timezone — quiet hours are local hours,
 *  and a window declared in UTC would be quiet at the wrong end of the day. */
function blackoutOf(raw: string | number | boolean): Blackout | null {
  const parts = String(raw).split(/[-–—]/);
  const [from, to] = parts.map((part) => part.trim());
  if (parts.length !== 2 || from === undefined || to === undefined) return null;
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return null;
  return { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, from, to };
}

const BLACKOUT = "blackout_hours";

/** Display unit → wire unit, by predicate. Anything absent passes through. */
const SCALE: Record<string, number> = { hold_seconds: 3600, max_apr_bps: 100 };

function wireValue(
  predicate: string,
  raw: string | number | boolean,
): number | boolean | string {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "false") return raw === "true";
  const scale = SCALE[predicate];
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && String(raw).trim() !== "") {
    return scale === undefined ? numeric : Math.round(numeric * scale);
  }
  return String(raw);
}

function editOf(constraint: Constraint): BoundEdit {
  return {
    predicate: constraint.key,
    value: wireValue(constraint.key, constraint.value),
  };
}

/** The envelope a proposal names by its category, not by a bound predicate. */
const ENVELOPE_RULE = "cap_paise";

const SCOPE_RULES: Record<string, "merchants" | "skus"> = {
  merchant: "merchants",
  sku: "skus",
};

function fromProposals(changes: readonly ProposedChange[]): SealRequest {
  const request = blank("");
  for (const change of changes) {
    const list = SCOPE_RULES[change.rule];
    if (change.rule === ENVELOPE_RULE && change.scope !== null) {
      request.envelopes.push({
        category: change.scope,
        cap_paise: Number(change.to),
      });
    } else if (list !== undefined && change.scope !== null) {
      request[list].push(change.scope);
    } else {
      request.bounds.push({ predicate: change.rule, value: change.to });
    }
  }
  return request;
}

function blank(description: string): SealRequest {
  return { description, bounds: [], envelopes: [], merchants: [], skus: [] };
}

/**
 * Everything the seal sheet billed, and nothing it did not. The screen sends
 * the changes it displayed rather than the covenant they add up to: the host
 * reads what is in force and overlays them itself, so a tampered page cannot
 * hand the user's own key a covenant nobody was shown.
 */
export function sealRequest(
  drafts: CovenantDrafts,
  description: string,
): SealRequest {
  const proposed = fromProposals(drafts.proposed.flatMap((a) => a.changes));
  const cooloff: BoundEdit[] = [];
  if (drafts.cooloff.thresholdPaise !== undefined) {
    cooloff.push({
      predicate: "threshold_paise",
      value: Number(drafts.cooloff.thresholdPaise),
    });
  }
  if (drafts.cooloff.durationHours !== undefined) {
    cooloff.push(wireHold(drafts.cooloff.durationHours));
  }
  const scalars = [
    ...drafts.constraints.filter((c) => c.amended),
    ...drafts.added,
  ];
  const quiet = scalars.find((c) => c.key === BLACKOUT);
  const blackout = quiet === undefined ? null : blackoutOf(quiet.value);
  return {
    description,
    ...(blackout === null ? {} : { blackout }),
    bounds: [
      ...proposed.bounds,
      ...scalars.filter((c) => c.key !== BLACKOUT).map(editOf),
      ...cooloff,
    ],
    envelopes: [
      ...proposed.envelopes,
      ...Object.entries(drafts.envCaps).map(([category, cap]) => ({
        category,
        cap_paise: Number(cap),
      })),
    ],
    merchants: [...proposed.merchants, ...drafts.scopeAdds.merchants],
    skus: [...proposed.skus, ...drafts.scopeAdds.skus],
  };
}

function wireHold(hours: string): BoundEdit {
  return { predicate: "hold_seconds", value: wireValue("hold_seconds", hours) };
}
