import type { Clock } from "@covenant/domain";

import type { CovenantVerdict } from "../cart/cart-covenant.js";
import type { ActionResult } from "../drive/refusal.js";
import { covenantRefusal, ok } from "../drive/refusal.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { Journal } from "../journal.js";
import type { DrivenPage, Waiter } from "../ports.js";
import type {
  Handoff,
  HandoffReason,
  SessionStateMachine,
} from "../session-state.js";
import { SessionStateError } from "../session-state.js";
import type { Readiness, ReadinessSignal } from "./readiness.js";
import {
  DEFAULT_ACCOUNT_MARKERS,
  readinessHuman,
  SIGNALLING_REASONS,
} from "./readiness.js";

export interface HandoffConfig {
  readonly pollIntervalMs: number;
  readonly maxPolls: number;
  readonly accountMarkers: readonly string[];
}

export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  pollIntervalMs: 1000,
  maxPolls: 120,
  accountMarkers: DEFAULT_ACCOUNT_MARKERS,
};

/**
 * Owns the answer to one question: who is driving, and why. Pausing is
 * automatic because a block must never depend on the agent cooperating;
 * resuming is not, because only a person can know they are finished.
 */
export class HandoffController {
  private handoff: Handoff | null = null;

  constructor(
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
    private readonly probe: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly waiter: Waiter,
    private readonly clock: Clock,
    private readonly config: HandoffConfig = DEFAULT_HANDOFF_CONFIG,
  ) {}

  current(): Handoff | null {
    return this.handoff;
  }

  /** Idempotent: the first reason to pause is the one that owns the pause. */
  raise(reason: HandoffReason, url: string): Handoff {
    const existing = this.handoff;
    if (existing !== null) {
      this.journal.append(
        {
          kind: "handoff.raised",
          url,
          detail: { reason, already_paused: true },
        },
        this.state.current(),
      );
      return existing;
    }
    this.state.transition("user-drive");
    this.handoff = {
      stage: "user-drive",
      reason,
      url,
      at: this.clock.now().toISOString(),
    };
    this.journal.append(
      { kind: "handoff.raised", url, detail: { reason } },
      this.state.current(),
    );
    return this.handoff;
  }

  /** User-initiated only. Nothing inside this package ever calls it. */
  resume(): Handoff {
    const handoff = this.handoff;
    if (handoff === null) {
      throw new SessionStateError(this.state.current(), "agent-drive");
    }
    this.state.transition("agent-drive");
    this.handoff = null;
    this.journal.append(
      {
        kind: "handoff.resumed",
        url: handoff.url,
        detail: { reason: handoff.reason },
      },
      this.state.current(),
    );
    return handoff;
  }

  /**
   * Polls for post-handoff signals and reports them. It returns a suggestion —
   * `resume()` is still a separate, user-initiated call, and no path here
   * shortcuts to it.
   */
  async waitForUserCompletion(): Promise<Readiness> {
    const handoff = this.handoff;
    if (handoff === null) {
      throw new SessionStateError(this.state.current(), "user-drive");
    }
    let last = await this.probeOnce(handoff, 1);
    for (let poll = 2; poll <= this.config.maxPolls && !last.ready; poll += 1) {
      await this.waiter.sleep(this.config.pollIntervalMs);
      last = await this.probeOnce(handoff, poll);
    }
    this.journal.append(
      {
        kind: "readiness.polled",
        url: last.url,
        detail: {
          ready: last.ready,
          polls: last.polls,
          reason: handoff.reason,
        },
      },
      this.state.current(),
    );
    return last;
  }

  /** The last gate before payment: assist, or say plainly that we will not. */
  requestFinalReview(verdict: CovenantVerdict): ActionResult<Handoff> {
    const url = this.probe.url();
    this.journal.append(
      { kind: "covenant.checked", url, detail: { ...verdict } },
      this.state.current(),
    );
    if (!verdict.assists) {
      this.journal.append(
        { kind: "handoff.refused", url, detail: { outcome: verdict.outcome } },
        this.state.current(),
      );
      return covenantRefusal(verdict);
    }
    return ok(this.raise("final-review", url));
  }

  private async probeOnce(handoff: Handoff, poll: number): Promise<Readiness> {
    const url = this.probe.url();
    const signals = await this.signalsFor(handoff, url);
    const ready =
      SIGNALLING_REASONS.includes(handoff.reason) &&
      signals.some((signal) => signal.met);
    return {
      ready,
      polls: poll,
      url,
      signals,
      human: readinessHuman(handoff.reason, ready),
    };
  }

  private async signalsFor(
    handoff: Handoff,
    url: string,
  ): Promise<readonly ReadinessSignal[]> {
    const context = this.classifier.contextOfUrl(url);
    const marker = await this.firstMarker();
    return [
      {
        name: "url_left_blocked_context",
        met: context !== handoff.reason,
        detail: `now ${context ?? "unrestricted"}`,
      },
      {
        name: "account_marker_present",
        met: marker !== null,
        detail: marker ?? "none of the account markers matched",
      },
    ];
  }

  private async firstMarker(): Promise<string | null> {
    for (const marker of this.config.accountMarkers) {
      if (await this.probe.exists(marker)) {
        return marker;
      }
    }
    return null;
  }
}
