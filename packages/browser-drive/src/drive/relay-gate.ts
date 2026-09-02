import type {
  Classification,
  ElementDescriptor,
  SensitiveCategory,
} from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { RelayPolicy } from "../surface.js";
import type { Refusal } from "./refusal.js";
import { opaqueTarget, unknownTarget } from "./relay-refusals.js";

/**
 * Elements whose inside is another document. `document.activeElement` reports
 * the frame, not the field within it, so a keystroke aimed here would be typed
 * into content the classifier never saw — which is precisely where a hosted
 * card form lives. Refused on both surfaces: an unreadable target cannot be
 * protected, and a target that cannot be protected cannot be blacked out.
 */
export const OPAQUE_TAGS: readonly string[] = ["iframe", "frame", "object", "embed"];

export type Gate =
  | { readonly kind: "refused"; readonly refusal: Refusal }
  | { readonly kind: "open" }
  /** The human's own hand on a field this session must not watch or record. */
  | { readonly kind: "protected"; readonly category: SensitiveCategory };

/**
 * What the relay is allowed to reach, judged before anything is sent.
 *
 * DECISION: this is where the two surfaces genuinely differ, and it is the only
 * place they do. With a window on the user's desktop, a credential belongs in
 * that window — the relay refuses and points there, so the keystrokes provably
 * never traverse this process. A container has no such window; refusing there
 * would not protect the password, it would just make the session useless and
 * push the user somewhere with no covenant on it at all. So the relay carries
 * it, and the cost is paid in `FrameCapture`, which stops taking pictures for
 * as long as the field holds focus, and in `UserInput`, which writes a line
 * saying that it happened and not one character of what was typed.
 *
 * What does *not* change with the surface: `GuardedPage` still refuses every
 * one of these. The agent never types a credential on either surface, because
 * the agent does not come through here at all.
 */
export class RelayGate {
  constructor(
    private readonly classifier: FieldClassifier,
    private readonly policy: RelayPolicy,
  ) {}

  judge(target: ElementDescriptor | null, action: string): Gate {
    if (target === null) {
      return { kind: "refused", refusal: unknownTarget(action) };
    }
    if (OPAQUE_TAGS.includes(target.tag)) {
      return { kind: "refused", refusal: opaqueTarget(target.tag) };
    }
    const verdict = this.classifier.classify(target);
    if (!verdict.sensitive || verdict.category === null) {
      return { kind: "open" };
    }
    if (this.policy.carriesSensitive) {
      return { kind: "protected", category: verdict.category };
    }
    return { kind: "refused", refusal: refusalOf(verdict) };
  }
}

export function refusalOf(verdict: Classification): Refusal {
  return {
    ok: false,
    reason:
      verdict.category === "payment_button"
        ? "payment_button"
        : "sensitive_field",
    category: verdict.category,
    rule: verdict.rule,
    human: verdict.human,
    handoff: null,
    handoffReason: verdict.handoff,
  };
}
