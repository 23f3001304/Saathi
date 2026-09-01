import type { MemoryWriteCandidate } from "../src/index.js";

import { MERCHANT_SIG, USER_SIG } from "./fakes.js";

export interface Seed {
  readonly key: string;
  readonly over: Partial<MemoryWriteCandidate>;
}

/** One live entry per (type, tier) the read-gate table distinguishes (§9.3). */
export const SEEDS: readonly Seed[] = [
  {
    key: "constraint",
    over: {
      type: "constraint",
      sourceChannel: "user_signed_mandate",
      sig: USER_SIG,
      subject: "user",
      predicate: "max_amount",
      content: { value: 200000 },
    },
  },
  {
    key: "preference",
    over: {
      type: "preference",
      subject: "user",
      predicate: "colour",
      content: { value: "indigo" },
    },
  },
  {
    key: "price",
    over: {
      type: "fact",
      sourceChannel: "merchant_attestation",
      sig: MERCHANT_SIG,
      subject: "sku_1",
      predicate: "price",
      content: { value: 149900 },
    },
  },
  {
    key: "quarantined",
    over: {
      type: "fact",
      sourceChannel: "untrusted_text",
      subject: "sku_2",
      predicate: "colour",
      content: { value: "scarlet" },
    },
  },
  {
    key: "episode",
    over: {
      type: "episode",
      subject: "sess_1",
      predicate: "turn",
      content: { value: "find me indigo shoes" },
    },
  },
  {
    key: "procedure",
    over: {
      type: "procedure",
      subject: "m_kirana",
      predicate: "checkout",
      content: { value: "two-step form" },
    },
  },
];
