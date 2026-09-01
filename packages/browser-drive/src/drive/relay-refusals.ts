import type { Refusal } from "./refusal.js";

// The three ways the relay says no before the classifier even speaks. All of
// them fail closed: an unreadable, opaque or absent target is not a target.

/**
 * Fail-closed on the relay: a keystroke whose destination could not be read is
 * a keystroke that might be landing in a password box, so it is not sent.
 */
export function unknownTarget(action: string): Refusal {
  return {
    ok: false,
    reason: "element_missing",
    category: null,
    rule: "relay_target_unreadable",
    human: `Nothing identifiable is under that ${action}, so nothing was sent to the window.`,
    handoff: null,
    handoffReason: null,
  };
}


/**
 * A frame, plugin or embed. Its contents belong to another document that this
 * package cannot read, so the classifier has nothing to judge — and a hosted
 * card form is exactly the thing that lives inside one.
 */
export function opaqueTarget(tag: string): Refusal {
  return {
    ok: false,
    reason: "restricted_context",
    category: null,
    rule: "relay_target_opaque",
    human: `That is an embedded <${tag}> whose contents this session cannot inspect, so nothing is relayed into it. Use the window itself.`,
    handoff: null,
    handoffReason: null,
  };
}


/**
 * Nothing editable holds focus. Relaying the characters anyway would send them
 * to whatever the document does with a stray keystroke, which is a target
 * nobody classified.
 */
export function noTextTarget(): Refusal {
  return {
    ok: false,
    reason: "element_missing",
    category: null,
    rule: "relay_no_text_target",
    human:
      "Nothing in the window is taking text right now. Click the field you mean first, and I will pass the keys to it.",
    handoff: null,
    handoffReason: null,
  };
}
