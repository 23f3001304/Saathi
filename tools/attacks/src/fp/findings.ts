import { byDetector } from "./matrix.js";
import type { ScenarioResult } from "./types.js";

/**
 * Each finding is a claim the corpus *measured*, written as prose because the
 * number alone does not say what to do about it. They are numbered so the
 * final report and a code review can refer to the same thing.
 */
const STATIC: readonly string[] = [
  "**F1 - R4 is a labeller, not the defence.** §9.1 decision 39 says so, and the measurement agrees: every R4 false block is untrusted text that the read gate already keeps out of cart construction. The cost is a dropped catalog belief, never a blocked purchase. Tuning `AUTHORITY_PATTERNS@v1` is a reviewable diff and nothing downstream depends on it.",
  "**F2 - a signed channel refused by R4 is a dead end.** R4 fires at any tier below P3, so a merchant-signed attestation whose text trips a pattern (B05) is refused with `obtain_signed_attestation` as its remedy - a door the merchant is already standing in. P2 is a merchant's ceiling. Either R4 should exempt signed channels or the remedy is wrong.",
  "**F3 - an untrusted key cannot be re-observed.** `MIN_TIER_TO_SUPERSEDE.fact` is P1 and `untrusted_text` grants P0, and stage 2 runs before stage 4a's dedupe - so a crawler that reads the same product page twice is refused the second time with `TYPE_REQUIRES_HIGHER_TIER` (A15), even when the content is byte-identical (A16 shows the same for an edit). Dedupe never gets the chance to save it.",
  "**F4 - R1 reads `threshold_paise` backwards.** Lowering a cool-off threshold parks *more* purchases, which is a tightening; R1's `FLOOR_PREDICATES` treat a lower value as a widening and refuse it (C04). `hold_seconds` in the same list is classified correctly, so this is one entry in one table.",
  "**F5 - R1 has no tier exemption, so the signing sheet can be refused.** A user re-signing a higher cap through `user_signed_mandate` is `CONSTRAINT_RELAXATION_ATTEMPT` (C06). That is a hard dead end: P3 is the user's ceiling and there is no other door into a constraint (§9.2). Whether a user may raise their own cap is a policy call, but today the answer is no, silently.",
  "**F6 - §6.2's own cool-off numbers make the feature unreachable.** With `cooloff.hold_seconds: 86400` on a 24 h intent, `holdUntil > intent.exp` always, so every above-threshold cart fails `COOLOFF_EXCEEDS_INTENT_EXPIRY` instead of holding (E14). The same cart with a one-hour hold holds correctly (E15). The fix is a bound (`hold_seconds <= intent TTL`) at signing time, not a check change.",
  "**F7 - three of the five rules cannot fire against a real covenant.** `POST /covenant/sign` files bounds under their §6.2 key names (`allowance`, `cooloff`, `envelopes`, `merchants`, `skus`), while R1 keys on `max_amount`/`cap_paise`/`threshold_paise`/`hold_seconds`, R2 on `merchant`/`sku`/`category` and R5 on the same predicates. Only R3 and R4 are reachable end to end today; the corpus and T-1 seed the normalised predicates so R1 is exercised at all.",
];

export function findingsFor(scenarios: readonly ScenarioResult[]): readonly string[] {
  const detectors = byDetector(scenarios);
  return [
    ...STATIC,
    `**F8 - the blocks concentrate.** ${detectors.length} distinct detector(s) produced every false block: ${detectors
      .map((row) => `\`${row.detector}\` (${row.blocks})`)
      .join(", ")}. Nothing is diffuse, so each finding above is a bounded change.`,
  ];
}
