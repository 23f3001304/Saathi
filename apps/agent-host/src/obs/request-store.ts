import type { AsyncLocalStorage } from "node:async_hooks";

/**
 * What every log line carries (§10.2, §10.4): the `Request-Id` threaded through
 * the whole call, so one string pivots from an agent-host log line to the
 * gateway's ledger event for the same request.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly tenantId: string;
  readonly runId: string | null;
}

export type ContextStore = AsyncLocalStorage<RequestContext>;

/** A log line from outside a request — boot, the CLI, a background run. */
const DETACHED: Readonly<Record<string, string | null>> = {
  request_id: null,
  tenant_id: null,
  run_id: null,
};

export function contextFields(
  store: ContextStore,
): Readonly<Record<string, string | null>> {
  const current = store.getStore();
  if (current === undefined) {
    return DETACHED;
  }
  return {
    request_id: current.requestId,
    tenant_id: current.tenantId,
    run_id: current.runId,
  };
}
