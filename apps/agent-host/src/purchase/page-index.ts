import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Clock, Logger } from "@covenant/domain";

/** One page this host has opened and read, worth opening again. */
export interface IndexedPage {
  readonly url: string;
  readonly title: string;
  readonly merchant: string;
}

/**
 * Pages this host has seen, across every conversation.
 *
 * DECISION: what is remembered is that a URL was a real product page on a real
 * shop, and nothing else. No price, no availability, no rating. Those are
 * claims a page made on one day, and the whole design rests on reading the
 * page rather than believing a claim about it - a cached price handed to a
 * shopper as current would be exactly the thing `web_card` refuses when the
 * model asserts one. So this shortens the SEARCH and never the verification:
 * `web_verify` still opens every page, live, every time.
 *
 * DECISION: host-wide rather than per conversation. `WorkingContext` already
 * remembers one conversation's own finds and feeds them back as ALREADY FOUND;
 * this is the same idea with the walls taken down, so the second shopper to
 * ask for a 2 TB NVMe starts from pages the first one's errand already proved
 * were real. Nothing shopper-specific is stored, which is what makes sharing
 * it across conversations safe: a URL and a title carry no one's identity.
 */
export interface PageIndex {
  /** Pages seen for a subject, most recently confirmed first. */
  recall: (subject: string, limit: number) => readonly IndexedPage[];
  /** Records pages an errand actually carded. */
  remember: (subject: string, pages: readonly IndexedPage[]) => void;
  close: () => void;
}

/** Long enough to be worth having, short enough that a dead shop drops out. */
export const PAGE_INDEX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS page_index (
  subject   TEXT    NOT NULL,
  url       TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  merchant  TEXT    NOT NULL,
  at_ms     INTEGER NOT NULL,
  PRIMARY KEY (subject, url)
) STRICT;
CREATE INDEX IF NOT EXISTS page_index_subject ON page_index (subject, at_ms DESC);
`;

const UPSERT = `INSERT INTO page_index (subject, url, title, merchant, at_ms)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(subject, url) DO UPDATE SET
    title = excluded.title, merchant = excluded.merchant, at_ms = excluded.at_ms`;

const RECALL = `SELECT url, title, merchant FROM page_index
  WHERE subject = ? AND at_ms >= ?
  ORDER BY at_ms DESC LIMIT ?`;

const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA busy_timeout = 5000",
  "PRAGMA trusted_schema = OFF",
].join(";");

class SqlitePageIndex implements PageIndex {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock,
  ) {
    db.exec(PRAGMAS);
    db.exec(DDL);
    this.sweep();
  }

  recall(subject: string, limit: number): readonly IndexedPage[] {
    const key = subjectKey(subject);
    if (key === "") return [];
    const fresh = this.clock.now().getTime() - PAGE_INDEX_MAX_AGE_MS;
    const rows = this.db
      .prepare(RECALL)
      .all(key, fresh, Math.max(0, Math.trunc(limit)));
    // Read back as strings rather than trusted wholesale: every value here
    // came off a page once, and a row is data even when this host wrote it.
    return rows.map((row) => ({
      url: String(row["url"] ?? ""),
      title: String(row["title"] ?? ""),
      merchant: String(row["merchant"] ?? ""),
    }));
  }

  remember(subject: string, pages: readonly IndexedPage[]): void {
    const key = subjectKey(subject);
    if (key === "") return;
    const at = this.clock.now().getTime();
    for (const page of pages) {
      if (page.url === "") continue;
      this.db.prepare(UPSERT).run(key, page.url, page.title, page.merchant, at);
    }
  }

  close(): void {
    this.db.close();
  }

  private sweep(): void {
    this.db
      .prepare("DELETE FROM page_index WHERE at_ms < ?")
      .run(this.clock.now().getTime() - PAGE_INDEX_MAX_AGE_MS);
  }
}

/**
 * The key a subject is filed under.
 *
 * Deliberately blunt: lowercased words, sorted, deduplicated. "2 TB NVMe SSD"
 * and "nvme ssd 2tb" are the same shelf and should find each other, while
 * anything more clever would be a relevance engine, and a relevance engine
 * that decides what a shopper meant is the thing this system keeps refusing to
 * build. A miss costs one web search, which is what happened before.
 */
export function subjectKey(subject: string): string {
  const words = subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word.length > 1);
  return [...new Set(words)].sort().join(" ");
}

/** A host that cannot reach the database still runs; it just searches. */
export function forgetfulPageIndex(): PageIndex {
  return {
    recall: () => [],
    remember: () => undefined,
    close: () => undefined,
  };
}

export function openPageIndex(
  file: string,
  clock: Clock,
  logger: Logger,
): PageIndex {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const index = new SqlitePageIndex(new DatabaseSync(file), clock);
    logger.info("web.index.opened", { file });
    return index;
  } catch (cause) {
    logger.warn("web.index.unavailable", {
      file,
      cause: cause instanceof Error ? cause.message : "unknown",
    });
    return forgetfulPageIndex();
  }
}
