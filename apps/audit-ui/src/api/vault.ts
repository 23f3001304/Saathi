// The stored sign-ins. The password goes up once and never comes back down:
// the list carries host and username only, and there is no read-one call.
import { agentBaseUrl } from "./liveMode.ts";

export interface VaultRow {
  readonly host: string;
  readonly username: string;
}

export async function fetchSignIns(): Promise<readonly VaultRow[]> {
  const base = agentBaseUrl();
  if (base === null) return [];
  try {
    const answer = await fetch(`${base}/vault/credentials`);
    const body = (await answer.json()) as { credentials?: VaultRow[] };
    return body.credentials ?? [];
  } catch {
    return [];
  }
}

export async function saveSignIn(
  host: string,
  username: string,
  password: string,
): Promise<boolean> {
  const base = agentBaseUrl();
  if (base === null) return false;
  try {
    const answer = await fetch(`${base}/vault/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host, username, password }),
    });
    return answer.ok;
  } catch {
    return false;
  }
}

export async function removeSignIn(host: string): Promise<void> {
  const base = agentBaseUrl();
  if (base === null) return;
  try {
    await fetch(`${base}/vault/credentials/${encodeURIComponent(host)}`, {
      method: "DELETE",
    });
  } catch {
    // The list will still show it; the next attempt can remove it.
  }
}
