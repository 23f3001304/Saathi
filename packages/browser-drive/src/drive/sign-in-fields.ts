import { isTextEntry } from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { FieldSnapshot } from "../ports.js";

/**
 * A box that is actually on the page.
 *
 * DECISION: geometry, not the DOM's word for it. A sign-in page routinely
 * carries a hidden password input the shopper never sees - Amazon's
 * email-first step does - and `page.type` focuses its target and then sends
 * keystrokes: focusing an element with no box silently does nothing, so the
 * keys went to whatever still had focus. Live, that was the email box that had
 * just been filled, and the shopper's password was typed into it in plain
 * sight, appended to their address. A field with no box is not a field this
 * may type into.
 */
function onScreen(field: FieldSnapshot): boolean {
  return field.rect.width > 0 && field.rect.height > 0;
}

export function passwordField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find(
      (field) =>
        onScreen(field) &&
        classifier.classify(field.descriptor).category === "password",
    ) ?? null
  );
}

/** The plain text or email entry standing beside the password: not itself
 *  sensitive beyond login context, and not the password box. */
export function usernameField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find((field) => {
      const held = field.descriptor;
      if (!onScreen(field)) return false;
      if (!isTextEntry(held) || held.inputType === "password") return false;
      const category = classifier.classify(held).category;
      return category === null || category === "login_context";
    }) ?? null
  );
}

/** The one box the classifier calls a code box, and only where it is on the
 *  page: a shopper's one-time code is as much theirs as a password. */
export function codeField(
  fields: readonly FieldSnapshot[],
  classifier: FieldClassifier,
): FieldSnapshot | null {
  return (
    fields.find(
      (field) =>
        onScreen(field) && classifier.classify(field.descriptor).category === "otp",
    ) ?? null
  );
}
