import type { MemoryContent, MemoryEntry, SourceChannel } from "@covenant/domain";
import { contentHashOf, entryHashOf } from "@covenant/memory";

import { append, TENANT, USER, type Stack } from "./harness.js";

export interface MemorySeed {
  readonly id: string;
  readonly type: MemoryEntry["type"];
  readonly tier: MemoryEntry["tier"];
  readonly quarantined?: boolean;
  readonly subject: string | null;
  readonly predicate?: string | null;
  readonly content: MemoryContent;
  readonly sourceChannel?: SourceChannel;
  readonly userId?: string;
  readonly tCreated?: string;
}

/** Mints a real backing event, then writes a fully-hashed `MemoryEntry` —
 * a fixture usable through `SqliteMemoryReader.search`, not a bare object. */
export function seedMemory(stack: Stack, seed: MemorySeed): MemoryEntry {
  const event = append(stack, "memory.write.committed", { memory_id: seed.id });
  const draftEntry = withoutHash(seed, seed.tCreated ?? event.ts, event.id);
  const entry: MemoryEntry = { ...draftEntry, entryHash: entryHashOf(draftEntry as MemoryEntry) };
  stack.memoryWriter.put(entry);
  return entry;
}

function withoutHash(
  seed: MemorySeed,
  tCreated: string,
  writeEventId: string,
): Omit<MemoryEntry, "entryHash"> {
  return {
    id: seed.id,
    tenantId: TENANT,
    userId: seed.userId ?? USER,
    type: seed.type,
    tier: seed.tier,
    quarantined: seed.quarantined ?? false,
    subject: seed.subject,
    predicate: seed.predicate ?? null,
    content: seed.content,
    contentHash: contentHashOf(seed.content),
    sourceChannel: seed.sourceChannel ?? "verified_api",
    sourceRef: null,
    tValid: tCreated,
    tInvalid: null,
    tCreated,
    tExpired: null,
    supersededBy: null,
    writeEventId,
  };
}
