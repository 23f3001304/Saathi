import { NATIVE_ENTRY_SENTENCE, RELAY_KEYS } from "@covenant/browser-drive";
import type { RelayKey } from "@covenant/browser-drive";
import { z } from "zod";

import { SANDBOX_WINDOW } from "./sandbox-factory.js";

/**
 * The wire shape of a relayed action. Coordinates are clamped to the sandbox
 * window and the key name is a closed enum, so the parse is the first of the
 * relay's three gates — the state machine and the classifier are the other two.
 */
export const relayRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("click"),
    x: z.number().min(0).max(SANDBOX_WINDOW.width),
    y: z.number().min(0).max(SANDBOX_WINDOW.height),
  }),
  z.object({ kind: z.literal("type"), text: z.string().min(1).max(400) }),
  z.object({ kind: z.literal("key"), name: z.enum(RELAY_KEYS) }),
  z.object({ kind: z.literal("scroll"), dy: z.number().min(-4000).max(4000) }),
]);

export type RelayRequest = z.infer<typeof relayRequest>;

export interface RelayRefusal {
  readonly ok: false;
  readonly reason: string;
  readonly rule: string;
  readonly category: string | null;
  readonly human: string;
  /** True when the answer is "somewhere else", not "try again here". */
  readonly hand_off_natively: boolean;
  readonly native_entry: string | null;
  /** Whether the host already raised a window on the user's desktop. */
  readonly fronted: boolean;
  /** Where that somewhere else is: a window on the desktop, or a container. */
  readonly surface: "native-window" | "container" | null;
  /** The page to open in the user's own browser, when there is no window. */
  readonly open_url: string | null;
}

export type RelayResponse = { readonly ok: true } | RelayRefusal;

export const NATIVE_ENTRY = NATIVE_ENTRY_SENTENCE;

export type { RelayKey };
