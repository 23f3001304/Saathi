import type { CooloffToPass, Remedy, Verdict } from "@covenant/domain";
import { fail, hold, pass } from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";

const MS_PER_SECOND = 1000;

/**
 * Ulysses precommitment. `context.blackout` is already resolved to the window
 * containing `now` (or `null`), so this check stays a pure comparison and the
 * timezone arithmetic lives in the builder.
 *
 * DECISION (deviation from §8.4 check 8): a hold that would mature after the
 * intent expires **clamps to the intent expiry and holds**; it is a `fail`
 * only when no schedulable instant exists at all. Why: §6.2's own numbers — a
 * 24 h hold on a 24 h intent — put `now + hold_seconds` past `exp` for every
 * cart, so the shipped rule made the cool-off feature unreachable and refused
 * purchases the covenant permits (harness E14). A shorter wait still parks the
 * purchase and still leaves the cancel window open; a refusal leaves the user
 * with a dead end and no remedy but re-signing. The blackout edge does not
 * clamp: releasing before the window closes would spend inside hours the user
 * forbade, so that stays `COOLOFF_EXCEEDS_INTENT_EXPIRY`.
 */
export class CooloffCheck implements VerdictCheck {
  readonly id = "cooloff" as const;

  run(context: VerdictContext): Verdict {
    const seconds = this.holdSeconds(context);
    if (seconds === null) {
      return pass(this.id);
    }
    const requested = this.holdUntil(context, seconds);
    const until = schedulable(context, requested);
    return until === null
      ? fail(
          this.id,
          "COOLOFF_EXCEEDS_INTENT_EXPIRY",
          toPassFor(
            context,
            seconds,
            requested,
            "reissue_intent_with_later_expiry",
          ),
        )
      : hold(
          this.id,
          "COOLOFF_HOLD",
          toPassFor(context, seconds, until, "wait_or_cancel"),
        );
  }

  /** `null` when no hold is owed: no rule, under threshold, and no blackout. */
  private holdSeconds(context: VerdictContext): number | null {
    const rule = context.cooloffRule;
    const overThreshold =
      rule !== null && context.cartTotal.paise >= rule.threshold_paise;
    if (!overThreshold) {
      return context.blackout === null ? null : 0;
    }
    return rule.hold_seconds;
  }

  /** `max(now + holdSeconds, blackoutEnd)` — the later of the two constraints. */
  private holdUntil(context: VerdictContext, seconds: number): string {
    const elapsed = context.now.getTime() + seconds * MS_PER_SECOND;
    const blackoutEnd =
      context.blackout === null ? 0 : Date.parse(context.blackout.ends_at);
    return new Date(Math.max(elapsed, blackoutEnd)).toISOString();
  }
}

/**
 * The instant the hold may actually mature, or `null` when none exists: the
 * intent is already spent, or the blackout the user declared outlives the
 * authorization, so there is no moment that satisfies both.
 */
function schedulable(context: VerdictContext, until: string): string | null {
  const expiry = Date.parse(context.intent.exp);
  const blackoutEnd =
    context.blackout === null ? 0 : Date.parse(context.blackout.ends_at);
  if (expiry <= context.now.getTime() || blackoutEnd > expiry) {
    return null;
  }
  return new Date(Math.min(Date.parse(until), expiry)).toISOString();
}

function toPassFor(
  context: VerdictContext,
  seconds: number,
  until: string,
  remedy: Remedy,
): CooloffToPass {
  return {
    hold_id: context.cart.jti,
    hold_seconds: Math.round(
      (Date.parse(until) - context.now.getTime()) / MS_PER_SECOND,
    ),
    executes_at: until,
    cancel_url: `${context.cancelUrlBase}/${context.cart.jti}/cancel`,
    blackout_window: context.blackout,
    intent_expires_at: context.intent.exp,
    remedy,
  };
}
