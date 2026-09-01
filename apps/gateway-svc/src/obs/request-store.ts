import type { AsyncLocalStorage } from "node:async_hooks";

/**
 * What every log line and every span carries (§10.2, §10.4): the ACP
 * `Request-Id` threaded through the whole call, so a judge pivots from a log
 * line to a trace to a ledger event with one string.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly tenantId: string;
  readonly traceId: string | null;
  readonly spanId: string | null;
}

export type ContextStore = AsyncLocalStorage<RequestContext>;

/** A log line from outside a request — boot, a timer, the fold pass. */
const DETACHED: Readonly<Record<string, string | null>> = {
  request_id: null,
  tenant_id: null,
  trace_id: null,
  span_id: null,
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
    trace_id: current.traceId,
    span_id: current.spanId,
  };
}
