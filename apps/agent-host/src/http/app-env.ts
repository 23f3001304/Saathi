import type { Context } from "hono";

export const REQUEST_ID_HEADER = "Request-Id";

export interface AppEnv {
  readonly Variables: {
    requestId: string;
  };
}

export type AppContext = Context<AppEnv>;
