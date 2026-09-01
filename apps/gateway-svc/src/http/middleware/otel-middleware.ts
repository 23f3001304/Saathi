import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../app-env.js";

/**
 * Span attributes and status from the response (§10.2). A 4xx is a *client*
 * error and a policy rejection is a 200, so only 5xx sets `Status.ERROR`:
 * letting a blocked attack colour Jaeger red would make the error rate a
 * measure of how well the system is working.
 */
export function otelMiddleware(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    await next();
    const span = context.get("span");
    const status = context.res.status;
    span.setAttribute("http.response.status_code", status);
    span.setAttribute("covenant.request_id", context.get("requestId"));
    span.setAttribute("covenant.tenant_id", context.get("tenantId"));
    span.setStatus(status >= 500 ? "error" : "ok");
  };
}
