import { describe, expect, it } from "vitest";

import { ACTION_POLICY } from "@covenant/domain";

import { buildRetrievalSql } from "../src/retrieval-query.js";

const CHAT = ACTION_POLICY["chat"];

describe("scoping a retrieval to one conversation", () => {
  it("cuts the candidate slice by conversation, before ranking", () => {
    const built = buildRetrievalSql(CHAT, null, false, "cnv_a");
    expect(built.sql).toContain(
      "json_extract(content, '$.conversation_id') = ?",
    );
    expect(built.params).toContain("cnv_a");
  });

  it("keeps the corpus-wide read when no conversation is named", () => {
    for (const absent of [undefined, null]) {
      const built = buildRetrievalSql(CHAT, null, false, absent);
      expect(built.sql).not.toContain("conversation_id");
    }
  });

  it("binds the conversation before the temporal params, matching clause order", () => {
    // The clause list and the param list are built in one pass; a clause
    // whose `?` binds another clause's value would return the wrong rows
    // silently, which is why the order itself is pinned.
    const built = buildRetrievalSql(
      CHAT,
      "2026-09-01T00:00:00Z",
      false,
      "cnv_a",
    );
    const at = built.params.indexOf("cnv_a");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(built.params.slice(at + 1)).toEqual([
      "2026-09-01T00:00:00Z",
      "2026-09-01T00:00:00Z",
    ]);
  });
});
