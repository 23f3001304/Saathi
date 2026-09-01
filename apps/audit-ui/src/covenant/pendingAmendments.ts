// One pending set, shared by the conversation and the Rules screen.
//
// DECISION: a module store rather than a React context. A pending amendment
// proposed in chat and the pending amendment the Rules screen shows have to be
// the same noun — two parallel notions of "pending" is precisely how a change
// gets sealed on one screen and stays live on the other. Chat and Rules are
// different routes under a shell that neither of them owns, so the only place
// the state can be shared without one screen reaching into the other is beside
// them. `useRoute` already keeps route state this way, for the same reason.
import { useSyncExternalStore } from "react";
import type { PendingAmendment } from "./amendmentModel.ts";

let pending: readonly PendingAmendment[] = [];

const listeners = new Set<() => void>();

function publish(next: readonly PendingAmendment[]): void {
  pending = next;
  for (const listener of listeners) listener();
}

export function pendingAmendments(): readonly PendingAmendment[] {
  return pending;
}

/** Proposing the same amendment twice is one amendment. */
export function proposeAmendment(amendment: PendingAmendment): void {
  if (pending.some((held) => held.id === amendment.id)) return;
  publish([...pending, amendment]);
}

export function withdrawAmendment(id: string): void {
  const next = pending.filter((held) => held.id !== id);
  if (next.length !== pending.length) publish(next);
}

/** What the seal ceremony calls once the signature has actually landed. */
export function clearAmendments(): void {
  if (pending.length > 0) publish([]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePendingAmendments(): readonly PendingAmendment[] {
  return useSyncExternalStore(subscribe, pendingAmendments, pendingAmendments);
}
