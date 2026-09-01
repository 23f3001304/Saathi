import type { VerdictCheck } from "@covenant/gateway";
import {
  CooloffCheck,
  EnvelopeCheck,
  IntentBoundsCheck,
  MemoryDigestCheck,
  NonceCheck,
  QuoteMatchCheck,
  RiskDataCheck,
  UriPinCheck,
} from "@covenant/gateway";

/**
 * The eight checks in the §8.1 order, and the order is the specification: the
 * pipeline stamps one seal per check and the audit UI renders them in exactly
 * this sequence. A new check is one line here and zero engine edits (§2.8).
 */
export function wireChecks(): readonly VerdictCheck[] {
  return [
    new IntentBoundsCheck(),
    new NonceCheck(),
    new UriPinCheck(),
    new RiskDataCheck(),
    new MemoryDigestCheck(),
    new QuoteMatchCheck(),
    new EnvelopeCheck(),
    new CooloffCheck(),
  ];
}
