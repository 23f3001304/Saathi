// §2.4 / §8 beat 2:16–2:30 — a cart parked by the cooling-off rule, then
// cancelled (no confirm dialog, D11) so UndoStrip has something to show.
import type { CartPayload, CooloffPayload, LedgerFrame } from "../types.ts";
import { buildFrames, iso, type FrameInput } from "./helpers.ts";

export const COOLOFF_TXN_ID = "txn-cool2999";
export const COOLOFF_BASE_MS = Date.parse("2026-08-31T08:50:00.000Z");
export const COOLOFF_ID = "cooloff-2999a1";

const cart: CartPayload = {
  cart_id: "cart-2999a1",
  items: [
    {
      sku: "sundar-kurta-navy",
      title: "Navy Kurta (flash sale)",
      quantity: 1,
      unit_price_paise: 299_900,
      merchant: "sundar-textiles",
    },
  ],
  total_paise: 299_900,
  quote_signature_valid: true,
  memory_digest: "2999a1c4",
  justified_by: ["mem-constraint-cap"],
};

const parked: CooloffPayload = {
  id: COOLOFF_ID,
  txn_id: COOLOFF_TXN_ID,
  amount_paise: 299_900,
  release_at: iso(COOLOFF_BASE_MS, 24 * 60 * 60_000),
  merchant: "sundar-textiles",
  cues: ["only 2 left!!", "60% off: ends today"],
};

const inputs: FrameInput[] = [
  {
    offsetMs: 0,
    actor: "buyer_agent",
    kind: "cart.assembled",
    txn_id: COOLOFF_TXN_ID,
    payload: cart,
  },
  {
    offsetMs: 300,
    actor: "gateway",
    kind: "cooloff.parked",
    txn_id: COOLOFF_TXN_ID,
    payload: parked,
  },
  {
    offsetMs: 20_000,
    actor: "user",
    kind: "cooloff.cancelled",
    txn_id: COOLOFF_TXN_ID,
    payload: { id: COOLOFF_ID },
  },
];

export function coolingOffFrames(): LedgerFrame[] {
  return buildFrames(COOLOFF_BASE_MS, inputs);
}
