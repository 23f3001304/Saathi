import type { Hono } from "hono";
import { z } from "zod";

import type { CredentialVault } from "../session/credential-vault.js";
import type { AppContext, AppEnv } from "./app-env.js";

const saveRequest = z.object({
  host: z.string().min(1).max(200),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

async function save(
  context: AppContext,
  vault: CredentialVault,
): Promise<Response> {
  const parsed = saveRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  await vault.save(parsed.data);
  // The password is write-only from here on: the response, like the list,
  // carries everything except the one thing this store exists to hold.
  return context.json(
    { ok: true, host: parsed.data.host, username: parsed.data.username },
    200,
  );
}

/**
 * The shopper's stored sign-ins. What leaves this surface never includes a
 * password: saving answers without it, listing never had it, and there is no
 * read-one route at all. The only reader of the secret is the host's own
 * sign-in routine, which types it into the one field the classifier calls a
 * password box and journals `{protected: true}` and nothing else.
 */
export function registerVault(app: Hono<AppEnv>, vault: CredentialVault): void {
  app.post("/vault/credentials", (context) => save(context, vault));

  app.get("/vault/credentials", async (context) =>
    context.json({ ok: true, credentials: await vault.list() }, 200),
  );

  app.delete("/vault/credentials/:host", async (context) => {
    await vault.remove(context.req.param("host"));
    return context.json({ ok: true }, 200);
  });
}
