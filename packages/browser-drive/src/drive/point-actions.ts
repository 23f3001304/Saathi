import type { ElementDescriptor } from "../field/element-descriptor.js";
import { isTextEntry } from "../field/element-descriptor.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import type { HandoffController } from "../handoff/handoff-controller.js";
import type { Journal, JournalEventKind } from "../journal.js";
import type { DrivenPage } from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";
import type { ActionResult, Refusal } from "./refusal.js";
import { ok, reasonFor } from "./refusal.js";
import { OPAQUE_TAGS } from "./relay-gate.js";
import {
  noTextTarget,
  opaqueTarget,
  unknownTarget,
} from "./relay-refusals.js";

/**
 * The agent's coordinate verbs. The aim is a point; the judge is the same
 * `FieldClassifier` that judges the selector path and the human relay, run on
 * whatever the hit-test finds under that point. So the property §5.13 used to
 * state as "press this arbitrary button is not expressible" survives in its
 * stronger form: every press is expressible, and every press is judged. A
 * point landing on nothing readable, or on an embedded document, is refused
 * outright: what cannot be read cannot be touched.
 */
export class PointActions {
  constructor(
    private readonly page: DrivenPage,
    private readonly classifier: FieldClassifier,
    private readonly state: SessionStateMachine,
    private readonly journal: Journal,
    private readonly handoff: HandoffController,
  ) {}

  async click(x: number, y: number): Promise<ActionResult<null>> {
    this.state.assertAgentMayAct("click");
    const judged = await this.judge(x, y, "click");
    if (judged.refusal !== undefined) return judged.refusal;
    await this.page.clickAt(x, y);
    this.record("page.clicked", { x, y, target: judged.target.selector });
    return ok(null);
  }

  /** A click to put focus in the box, then keystrokes into that focus. The
   *  target is judged once, before either half happens, and a point that is
   *  not a text entry refuses before the click rather than after it. */
  async type(x: number, y: number, text: string): Promise<ActionResult<null>> {
    this.state.assertAgentMayAct("type");
    const judged = await this.judge(x, y, "type", { chars: text.length });
    if (judged.refusal !== undefined) return judged.refusal;
    if (!isTextEntry(judged.target)) {
      return this.refused(noTextTarget(), "type", { x, y });
    }
    await this.page.clickAt(x, y);
    await this.page.typeText(text);
    this.record("page.typed", { x, y, chars: text.length });
    return ok(null);
  }

  private async judge(
    x: number,
    y: number,
    action: string,
    detail: Readonly<Record<string, unknown>> = {},
  ): Promise<
    | { readonly target: ElementDescriptor; readonly refusal?: undefined }
    | { readonly target?: undefined; readonly refusal: Refusal }
  > {
    const target = await this.page.describeAt(x, y);
    if (target === null) {
      return { refusal: this.refused(unknownTarget(action), action, { x, y }) };
    }
    if (OPAQUE_TAGS.includes(target.tag)) {
      return {
        refusal: this.refused(opaqueTarget(target.tag), action, { x, y }),
      };
    }
    const verdict = this.classifier.classify(target);
    if (!verdict.sensitive) return { target };
    return { refusal: this.blocked(target, verdict, action, detail) };
  }

  /** The same consequence as the selector path's block: journalled, and the
   *  wheel moves to the user, because a sensitive control the agent aimed at
   *  is a step only the shopper may take. */
  private blocked(
    target: ElementDescriptor,
    verdict: ReturnType<FieldClassifier["classify"]>,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Refusal {
    this.record("action.blocked", {
      ...detail,
      action,
      target: target.selector,
      rule: verdict.rule,
      category: verdict.category,
      human: verdict.human,
    });
    const raised =
      verdict.handoff === null
        ? null
        : this.handoff.raise(verdict.handoff, this.page.url());
    return {
      ok: false,
      reason: reasonFor(verdict),
      category: verdict.category,
      rule: verdict.rule,
      human: verdict.human,
      handoff: raised,
      handoffReason: verdict.handoff,
    };
  }

  private refused(
    refusal: Refusal,
    action: string,
    detail: Readonly<Record<string, unknown>>,
  ): Refusal {
    this.record("action.blocked", { ...detail, action, rule: refusal.rule });
    return refusal;
  }

  private record(
    kind: JournalEventKind,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.journal.append(
      { kind, url: this.page.url(), detail },
      this.state.current(),
    );
  }
}
