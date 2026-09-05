/**
 * What the shop said after the submit, in the words the model acts on.
 *
 * DECISION: three answers, not two. `challenge` is read off the settled page
 * and was already right; the sentence printed beside it said "read the page
 * and carry on" for everything but a code, so a shop still showing its
 * password box was reported as a finished sign-in and the errand walked on
 * past a wall. There is nothing left for this host to type by then: the drive
 * works a form to its end and sends a password at most twice, so a password
 * box still standing means the shop is refusing what the vault holds.
 */
export function nextAfter(challenge: "code" | "password" | null): string {
  if (challenge === "code") {
    return (
      "The shop wants a one-time code only the shopper has. Stop and ask " +
      "them for it in your answer; they can also take the wheel and type it " +
      "themselves."
    );
  }
  if (challenge === "password") {
    return (
      "The shop is still asking for the password, so the stored sign-in did " +
      "not get you in. Do not try it again and never ask them for a password " +
      "in chat. Say the shop did not accept it and hand them the window."
    );
  }
  return "Read the page and carry on.";
}

