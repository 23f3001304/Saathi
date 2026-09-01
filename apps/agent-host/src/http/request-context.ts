import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import type { MiddlewareHandler } from "hono";

import type { ContextStore } from "../obs/request-store.js";
import type { AppEnv } from "./app-env.js";
import { REQUEST_ID_HEADER } from "./app-env.js";

export interface ContextDeps {
  readonly logger: Logger;
  readonly store: ContextStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly tenantId: string;
}

/**
 * `Request-Id` in, `Request-Id` out, and every log line inside the call carries
 * it (§10.4). A caller that presents one keeps it — that is how a browser
 * click, an agent-host log line and the gateway's ledger event end up sharing a
 * single string a judge can grep for.
 */
export function requestContext(deps: ContextDeps): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const requestId = context.req.header(REQUEST_ID_HEADER) ?? deps.ids.uuid();
    context.set("requestId", requestId);
    context.header(REQUEST_ID_HEADER, requestId);
    const startedAt = deps.clock.now().getTime();
    await deps.store.run(
      { requestId, tenantId: deps.tenantId, runId: null },
      async () => {
        await next();
      },
    );
    deps.logger.info("http.request", {
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      ms: deps.clock.now().getTime() - startedAt,
    });
  };
}
