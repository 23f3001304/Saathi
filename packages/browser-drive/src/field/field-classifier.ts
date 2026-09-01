import type { HandoffReason } from "../session-state.js";
import type {
  Classification,
  ElementDescriptor,
} from "./element-descriptor.js";
import {
  ALLOWED,
  contextTextOf,
  normalize,
  textOf,
} from "./element-descriptor.js";
import { REGISTER_URL, urlWords } from "./patterns.js";
import type { FieldRule, RuleContext } from "./rules.js";
import { FIELD_RULES } from "./rules.js";

/**
 * The security core, and deliberately the dullest class in the package: a pure
 * function over a serialized element, no I/O, no state, no clock. It is not
 * advisory — `GuardedPage` cannot proceed past a `sensitive` verdict, and the
 * block lives in harness code the model never sees (§10.2 hook 1, applied to a
 * page instead of a tool).
 *
 * Fail-closed, like `MoneyToolRegistry`: an element the rules cannot identify
 * inside a login, sign-up, verification or checkout scope is blocked by the
 * context rules, because a field nobody recognised on a payment page is exactly
 * the field worth not typing into.
 */
export class FieldClassifier {
  constructor(private readonly rules: readonly FieldRule[] = FIELD_RULES) {}

  classify(descriptor: ElementDescriptor): Classification {
    const context = this.contextOf(descriptor);
    for (const rule of this.rules) {
      if (rule.matches(descriptor, context)) {
        return this.verdict(rule, context);
      }
    }
    return ALLOWED;
  }

  /** True when any rule fires — the one-line form the driver reads. */
  isSensitive(descriptor: ElementDescriptor): boolean {
    return this.classify(descriptor).sensitive;
  }

  /**
   * URL-only judgement, used to flag a navigation without blocking it. Reading
   * a checkout page is how the cart gets inspected at all; only *acting* there
   * is refused.
   */
  contextOfUrl(url: string): HandoffReason | null {
    const descriptor = urlOnlyDescriptor(url);
    const context = this.contextOf(descriptor);
    const rule = this.rules.find(
      (candidate) =>
        candidate.id.endsWith("_form_context") &&
        candidate.matches(descriptor, context),
    );
    return rule === undefined ? null : this.resolveHandoff(rule, context);
  }

  private contextOf(descriptor: ElementDescriptor): RuleContext {
    return {
      words: textOf(descriptor),
      context: contextTextOf(descriptor),
      buttonText: normalize(descriptor.text),
      scope:
        `${urlWords(descriptor.formAction)} ${urlWords(descriptor.pageUrl)}`.trim(),
    };
  }

  private verdict(rule: FieldRule, context: RuleContext): Classification {
    return {
      sensitive: true,
      category: rule.category,
      rule: rule.id,
      handoff: this.resolveHandoff(rule, context),
      human: rule.human,
    };
  }

  /** A password inside a sign-up flow is account creation, not a sign-in. */
  private resolveHandoff(rule: FieldRule, context: RuleContext): HandoffReason {
    if (rule.authScoped && REGISTER_URL.test(context.scope)) {
      return "account-creation";
    }
    return rule.handoff;
  }
}

/** A descriptor carrying nothing but the page URL, for `contextOfUrl`. */
function urlOnlyDescriptor(url: string): ElementDescriptor {
  return {
    selector: "",
    tag: "input",
    inputType: "text",
    name: null,
    id: null,
    autocomplete: null,
    placeholder: null,
    ariaLabel: null,
    labelText: null,
    nearbyText: null,
    inputMode: null,
    pattern: null,
    maxLength: null,
    text: null,
    formAction: null,
    pageUrl: url,
  };
}
