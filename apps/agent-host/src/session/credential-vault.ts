import { promises as fs } from "node:fs";
import path from "node:path";

/** One shop's sign-in, as stored. The password leaves this file in exactly
 *  one direction: into `SignInDrive.into`, host-side. It is never listed
 *  back out, never logged, and no model-facing surface carries it. */
export interface VaultEntry {
  readonly host: string;
  readonly username: string;
  readonly password: string;
}

/** What a list may show: everything except the secret. */
export interface VaultRow {
  readonly host: string;
  readonly username: string;
}

function hostOf(raw: string): string {
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * The shopper's stored sign-ins, one JSON file under the gitignored data
 * directory. Plain storage is a stated demo tradeoff; the property that is
 * NOT traded is the model boundary: nothing here is reachable from a tool
 * argument, and `read()` is called only by the host's own sign-in routine.
 */
export class CredentialVault {
  constructor(private readonly file: string) {}

  async save(entry: VaultEntry): Promise<void> {
    const held = await this.load();
    held[hostOf(entry.host)] = {
      host: hostOf(entry.host),
      username: entry.username,
      password: entry.password,
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(held, null, 2), "utf8");
  }

  async remove(host: string): Promise<void> {
    const held = await this.load();
    delete held[hostOf(host)];
    await fs.writeFile(this.file, JSON.stringify(held, null, 2), "utf8");
  }

  async list(): Promise<readonly VaultRow[]> {
    const held = await this.load();
    return Object.values(held).map((row) => ({
      host: row.host,
      username: row.username,
    }));
  }

  /** The one read with the secret in it; callers are the sign-in routine
   *  and nobody else. Matched by page hostname, subdomains included. */
  async read(pageUrl: string): Promise<VaultEntry | null> {
    const host = hostOf(pageUrl);
    const held = await this.load();
    const direct = held[host];
    if (direct !== undefined) return direct;
    const parent = Object.values(held).find(
      (row) => host === row.host || host.endsWith(`.${row.host}`),
    );
    return parent ?? null;
  }

  private async load(): Promise<Record<string, VaultEntry>> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return JSON.parse(raw) as Record<string, VaultEntry>;
    } catch {
      return {};
    }
  }
}
