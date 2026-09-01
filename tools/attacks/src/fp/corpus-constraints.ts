import type { WriteSpec } from "../flow/memory.js";
import type { MemoryScenario, ScenarioContext } from "./types.js";

const FAMILY = "covenant edit (user_signed_mandate, P3)";

function signed(
  context: ScenarioContext,
  predicate: string,
  content: Readonly<Record<string, unknown>>,
): WriteSpec {
  return {
    type: "constraint",
    tierClaim: "P3",
    content,
    channel: "user_signed_mandate",
    sourceRef: context.intentJti,
    sig: context.intentJwt,
    subject: "user",
    predicate,
    userId: context.userId,
  };
}

/**
 * Tightening a covenant must always be allowed — a Ulysses contract the user
 * cannot pull tighter is not a contract, it is a ratchet in the wrong
 * direction. C04 and C06 are the two cases where the shipped direction table
 * and this principle disagree, and the corpus is here to measure that rather
 * than to assume it.
 */
export const CONSTRAINT_SCENARIOS: readonly MemoryScenario[] = [
  {
    id: "C01",
    family: FAMILY,
    description: "the user lowers their own spending cap",
    seeds: [
      (context) =>
        signed(context, "max_amount", { value: 200_000, currency: "INR", unit: "paise" }),
    ],
    write: (context) =>
      signed(context, "max_amount", { value: 150_000, currency: "INR", unit: "paise" }),
  },
  {
    id: "C02",
    family: FAMILY,
    description: "the user shrinks a category envelope",
    seeds: [(context) => signed(context, "cap_paise", { value: 500_000, unit: "paise" })],
    write: (context) => signed(context, "cap_paise", { value: 300_000, unit: "paise" }),
  },
  {
    id: "C03",
    family: FAMILY,
    description: "the user lengthens the cooling-off hold",
    seeds: [(context) => signed(context, "hold_seconds", { value: 3_600, unit: "seconds" })],
    write: (context) => signed(context, "hold_seconds", { value: 86_400, unit: "seconds" }),
  },
  {
    id: "C04",
    family: FAMILY,
    description: "the user lowers the cool-off threshold so MORE purchases are parked",
    seeds: [
      (context) => signed(context, "threshold_paise", { value: 500_000, unit: "paise" }),
    ],
    write: (context) => signed(context, "threshold_paise", { value: 100_000, unit: "paise" }),
  },
  {
    id: "C05",
    family: FAMILY,
    description: "the user tightens the maximum APR they will accept",
    seeds: [(context) => signed(context, "max_apr_bps", { value: 2_400, unit: "bps" })],
    write: (context) => signed(context, "max_apr_bps", { value: 1_200, unit: "bps" }),
  },
  {
    id: "C06",
    family: FAMILY,
    description: "the user re-signs a HIGHER cap at the signing sheet",
    seeds: [
      (context) =>
        signed(context, "max_amount", { value: 200_000, currency: "INR", unit: "paise" }),
    ],
    write: (context) =>
      signed(context, "max_amount", { value: 400_000, currency: "INR", unit: "paise" }),
  },
  {
    id: "C07",
    family: FAMILY,
    description: "a P1 fact naming a category the live allowlist already contains",
    seeds: [
      (context) =>
        signed(context, "category", { allowed: ["footwear", "apparel"] }),
    ],
    write: (context) => ({
      type: "fact",
      tierClaim: "P1",
      content: { category: "footwear" },
      channel: "verified_api",
      sourceRef: "catalog-api",
      sig: null,
      subject: "footwear",
      predicate: "category",
      userId: context.userId,
    }),
  },
];
