import type { ReasonCode } from "./reason-code.js";
import { httpStatusOf } from "./reason-code.js";
import { REASON_HUMAN } from "./reason-human.js";
import type { ToPass } from "./to-pass.js";

/**
 * Every failure inside a package carries a reason code, never a bare `Error`:
 * the HTTP layer maps it to an error envelope without inventing a taxonomy of
 * its own (§4.6).
 */
export class DomainError extends Error {
  readonly reasonCode: ReasonCode;
  readonly toPass: ToPass | null;
  readonly human: string;

  constructor(reasonCode: ReasonCode, toPass: ToPass | null = null) {
    super(REASON_HUMAN[reasonCode]);
    this.name = "DomainError";
    this.reasonCode = reasonCode;
    this.toPass = toPass;
    this.human = REASON_HUMAN[reasonCode];
  }

  get httpStatus(): number {
    return httpStatusOf(this.reasonCode);
  }
}
