import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One key per window.
 *
 * DECISION: the host-wide key stopped being sufficient the moment this host
 * could hold more than one window. It was never *wrong* before — with a single
 * sandbox, "you hold the host key" and "you own this window" were the same
 * statement — but it was only safe by accident of there being one. With N
 * open, a host key would let any tab that ever completed a handshake read the
 * frames of, and relay keystrokes into, every other errand on the machine.
 *
 * So the host key now means one thing only: you may ask this host to open a
 * sandbox. What you get back is a key that opens exactly that one, and every
 * route that reaches a window checks the key against the window named in its
 * own path. A key for session A on session B's route is refused — not because
 * the key is bad, but because it is not a key for that window, which is a
 * different refusal and says so.
 */
export class SessionKeys {
  private readonly keys = new Map<string, string>();

  mint(sessionId: string): string {
    const key = randomBytes(32).toString("hex");
    this.keys.set(sessionId, key);
    return key;
  }

  forget(sessionId: string): void {
    this.keys.delete(sessionId);
  }

  /** True only when this key is the one minted for exactly this session. */
  matches(sessionId: string, offered: string | null): boolean {
    const held = this.keys.get(sessionId);
    if (held === undefined || offered === null) return false;
    return constantTimeEqual(held, offered);
  }

  /**
   * Which window this key does open, when it opens one. Used only to tell a
   * caller holding a valid key for the wrong session from one holding no key
   * at all — the two are different mistakes and deserve different answers.
   */
  sessionFor(offered: string | null): string | null {
    if (offered === null) return null;
    for (const [id, key] of this.keys) {
      if (constantTimeEqual(key, offered)) return id;
    }
    return null;
  }

  get size(): number {
    return this.keys.size;
  }
}

/**
 * Length is compared first and separately, because `timingSafeEqual` throws on
 * a length mismatch rather than returning false. Both values here are 64 hex
 * characters, so a difference in length is a malformed offer, not a near miss.
 */
function constantTimeEqual(held: string, offered: string): boolean {
  if (held.length !== offered.length) return false;
  return timingSafeEqual(Buffer.from(held), Buffer.from(offered));
}

export const NOT_YOUR_SESSION = {
  ok: false,
  reason_code: "NOT_YOUR_SESSION",
  human:
    "That key is a valid sandbox key, but not for this window. Each sandbox on this host has its own key, so holding one does not grant the others, so this call was refused rather than quietly re-aimed at the window you can reach. Nothing was read and nothing was relayed.",
} as const;

export const NO_SUCH_SESSION = {
  ok: false,
  reason_code: "NO_SUCH_SESSION",
  human:
    "There is no sandbox open under that id on this host. It may have finished, been closed, or been reaped after nobody was left watching it. Nothing was opened in its place.",
} as const;
