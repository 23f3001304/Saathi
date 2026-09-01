import { describe, expect, it } from "vitest";

import { FieldClassifier } from "../src/field/field-classifier.js";
import { FIELD_RULES } from "../src/field/rules.js";
import { ACTION_CASES } from "./cases-actions.js";
import {
  CHECKOUT_COMMIT_CASES,
  CHECKOUT_FIELD_CASES,
  CHECKOUT_STEP_CASES,
} from "./cases-checkout.js";
import { CREDENTIAL_CASES } from "./cases-credentials.js";
import type { Case } from "./classifier-case.js";
import { LOGIN, PAY, REG, SHOP, VERIFY } from "./classifier-case.js";
import { el } from "./fakes.js";

const MATRIX: readonly Case[] = [
  ...CREDENTIAL_CASES,
  ...ACTION_CASES,
  ...CHECKOUT_COMMIT_CASES,
  ...CHECKOUT_STEP_CASES,
  ...CHECKOUT_FIELD_CASES,
];

const classifier = new FieldClassifier();

describe("FieldClassifier matrix", () => {
  it("covers every rule in the table at least once", () => {
    const fired = new Set(
      MATRIX.map((row) => classifier.classify(row.descriptor).rule),
    );
    const unexercised = FIELD_RULES.map((rule) => rule.id).filter(
      (id) => !fired.has(id),
    );
    expect(unexercised).toEqual([]);
  });

  it.each(MATRIX.map((row) => [row.name, row] as const))("%s", (_name, row) => {
    const verdict = classifier.classify(row.descriptor);
    expect(verdict.sensitive).toBe(row.category !== null);
    expect(verdict.category).toBe(row.category);
    expect(verdict.handoff).toBe(row.handoff);
  });

  it("every block carries a rule id and a sentence a person can read", () => {
    for (const row of MATRIX.filter(
      (candidate) => candidate.category !== null,
    )) {
      const verdict = classifier.classify(row.descriptor);
      expect(verdict.rule).not.toBe("no_rule_matched");
      expect(verdict.human.length).toBeGreaterThan(20);
    }
  });
});

describe("rule precedence", () => {
  it("reports the specific field, not the surrounding context", () => {
    const verdict = classifier.classify(
      el({ inputType: "password", name: "password", pageUrl: LOGIN }),
    );
    expect(verdict.rule).toBe("password_input_type");
    expect(verdict.category).toBe("password");
  });

  it("prefers cvv over the generic card rule", () => {
    expect(classifier.classify(el({ autocomplete: "cc-csc" })).category).toBe(
      "cvv",
    );
  });

  it("prefers otp over cvv for a bare security code", () => {
    expect(
      classifier.classify(el({ labelText: "Security code" })).category,
    ).toBe("otp");
  });
});

describe("contextOfUrl", () => {
  it.each([
    [SHOP, null],
    [LOGIN, "login"],
    [REG, "account-creation"],
    [VERIFY, "otp"],
    [PAY, "payment"],
  ])("%s -> %s", (url, expected) => {
    expect(classifier.contextOfUrl(url)).toBe(expected);
  });

  it("ignores the ancestors of a file:// path", () => {
    // The repo lives under a folder called `Razorpay`; matching it would mark
    // every fixture page a payment page.
    const url =
      "file:///C:/Users/dev/Razorpay/covenant/fixtures/shop/index.html";
    expect(classifier.contextOfUrl(url)).toBeNull();
  });

  it("still reads the page and its own folder in a file:// path", () => {
    const url =
      "file:///C:/Users/dev/Razorpay/covenant/fixtures/shop/checkout.html";
    expect(classifier.contextOfUrl(url)).toBe("payment");
  });

  it("reads an http host as part of the site's identity", () => {
    expect(classifier.contextOfUrl("https://checkout.example.com/step/1")).toBe(
      "payment",
    );
  });
});

describe("fail-closed posture", () => {
  it("blocks an unrecognised field inside a checkout form", () => {
    const verdict = classifier.classify(
      el({ name: "zzz_unknown_widget", pageUrl: PAY }),
    );
    expect(verdict.sensitive).toBe(true);
    expect(verdict.rule).toBe("payment_form_context");
  });

  it("allows an unrecognised field on an ordinary page", () => {
    expect(
      classifier.classify(el({ name: "zzz_unknown_widget" })).sensitive,
    ).toBe(false);
  });

  it("is pure: the same descriptor classifies the same way twice", () => {
    const descriptor = el({ inputType: "password" });
    expect(classifier.classify(descriptor)).toEqual(
      classifier.classify(descriptor),
    );
  });
});
