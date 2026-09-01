import type { SessionHandle } from "../browser/browser-registry.js";
import type { AppContext } from "./app-env.js";

/**
 * How a request finds its window. Returns the window, or the `Response` that
 * says why it may not have it — so a handler cannot forget to check, because
 * the thing it needs and the refusal arrive down the same channel.
 *
 * Its own module because both halves of the window surface depend on it and
 * neither should depend on the other: "how to read a window" and "how to
 * drive one" are separate, and a cycle between them would say otherwise.
 */
export type ResolveWindow = (context: AppContext) => SessionHandle | Response;

export function found(value: SessionHandle | Response): value is SessionHandle {
  return !(value instanceof Response);
}
