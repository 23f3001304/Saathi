import type { ActionPolicy, IsoTimestamp } from "@covenant/domain";

import { MEMORY_SELECT_SQL } from "./memory-row.js";

export interface RetrievalSql {
  readonly sql: string;
  /** Bound after `tenant_id` and `user_id`, before the trailing limit. */
  readonly params: readonly string[];
}

/**
 * DECISION: the action-class predicate is built here rather than inside
 * `SqliteMemoryReader`. Why: §9.3's policy is five columns wide and the
 * builder plus the reader's five other queries do not both fit in 200 lines —
 * and a policy translated into SQL is worth reading on its own.
 */
export function buildRetrievalSql(
  policy: ActionPolicy,
  asOf: IsoTimestamp | null,
  worldTimeSlice: boolean,
  conversationId?: string | null,
): RetrievalSql {
  const params: string[] = [];
  const clauses = [
    "tenant_id = ?",
    "user_id = ?",
    typeClause(policy, params),
    `tier >= ${policy.tierFloor}`,
    ...predicateClause(policy, params),
    ...quarantineClause(policy),
    ...conversationClause(conversationId, params),
    ...temporalClauses(asOf, worldTimeSlice, params),
  ];
  return {
    sql: `${MEMORY_SELECT_SQL} WHERE ${clauses.join(" AND ")}
 ORDER BY tier DESC, t_created DESC LIMIT ?`,
    params,
  };
}

function typeClause(policy: ActionPolicy, params: string[]): string {
  params.push(...policy.types);
  return `type IN (${policy.types.map(() => "?").join(", ")})`;
}

function predicateClause(
  policy: ActionPolicy,
  params: string[],
): readonly string[] {
  if (policy.predicates === null) {
    return [];
  }
  params.push(...policy.predicates);
  return [`predicate IN (${policy.predicates.map(() => "?").join(", ")})`];
}

/** The candidate slice is cut to `limit × factor` *before* ranking, so a
 * filter applied after the gate is a filter over somebody else's slice. A
 * conversation named here scopes the slice itself. */
function conversationClause(
  conversationId: string | null | undefined,
  params: string[],
): readonly string[] {
  if (conversationId === undefined || conversationId === null) {
    return [];
  }
  params.push(conversationId);
  return ["json_extract(content, '$.conversation_id') = ?"];
}

/** `chat` is the only class that sees quarantined rows, and it flags them. */
function quarantineClause(policy: ActionPolicy): readonly string[] {
  return policy.quarantinedVisible ? [] : ["quarantined = 0"];
}

/**
 * `as_of` is the bi-temporal slice of §4.4: system-time ("what did we know on
 * day N") for every class, and world-time as well for `price-history`, whose
 * whole question is what the price *was* then rather than what we had learned.
 * With no `as_of`, live means `t_expired IS NULL` — nothing is ever deleted,
 * so this is the only definition of live there is.
 */
function temporalClauses(
  asOf: IsoTimestamp | null,
  worldTimeSlice: boolean,
  params: string[],
): readonly string[] {
  if (asOf === null) {
    return ["t_expired IS NULL"];
  }
  params.push(asOf, asOf);
  const clauses = ["t_created <= ?", "(t_expired IS NULL OR t_expired > ?)"];
  if (worldTimeSlice) {
    params.push(asOf, asOf);
    clauses.push("t_valid <= ?", "(t_invalid IS NULL OR t_invalid > ?)");
  }
  return clauses;
}
