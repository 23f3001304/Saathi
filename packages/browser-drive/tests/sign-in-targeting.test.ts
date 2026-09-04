import { describe, expect, it } from "vitest";

import { CollectingJournalSink, Journal } from "../src/journal.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { SignInDrive } from "../src/drive/sign-in.js";
import { SessionStateMachine } from "../src/session-state.js";
import type { ElementDescriptor } from "../src/field/element-descriptor.js";
import { FakePage } from "./fake-page.js";
import { FixedClock } from "./fakes.js";

const CREDS = { username: "shopper@example.com", password: "hunter2" };

const PAGE = "https://amazon.in/ap/signin";

function fieldOf(over: Partial<ElementDescriptor>): ElementDescriptor {
  return {
    selector: "#x",
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
    pageUrl: PAGE,
    ...over,
  };
}

const EMAIL = fieldOf({
  selector: "#ap_email",
  inputType: "email",
  name: "email",
  labelText: "Email",
});

const PASSWORD = fieldOf({
  selector: "#ap_password",
  inputType: "password",
  name: "password",
  labelText: "Password",
  autocomplete: "current-password",
});

function box(x: number, y: number, width = 200, height = 30) {
  return { x, y, width, height };
}

function driveOver(page: FakePage): SignInDrive {
  const state = new SessionStateMachine();
  state.transition("agent-drive");
  return new SignInDrive(
    page,
    new FieldClassifier(),
    state,
    new Journal(new CollectingJournalSink(), new FixedClock(), "web_t"),
  );
}

function typedInto(page: FakePage): readonly string[] {
  return page.relayed
    .filter((move) => move.action === "type")
    .map((move) => move.detail);
}

/**
 * Amazon's email-first sign-in carries a hidden password input beside the
 * visible email box. `page.type(selector)` focuses its target and then sends
 * keystrokes, so focusing a box-less element does nothing and the keys land on
 * whatever still had focus - live, that was the email field, and the shopper's
 * password went into it in plain sight, appended to their own address.
 */
describe("an email-first sign-in", () => {
  /** The page it exists for asks the email first, so requiring a password box
   *  up front made the one shop that matters the one it could not sign in to. */
  it("fills the email, submits, and waits for the password step", async () => {
    const page = new FakePage({
      url: PAGE,
      fields: [
        { descriptor: EMAIL, rect: box(10, 10) },
        { descriptor: PASSWORD, rect: box(0, 0, 0, 0) },
      ],
      points: { "110,25": EMAIL, "140,115": PASSWORD },
    });
    // The password step arrives after the email is submitted, as it does live.
    page.onKey = () => {
      page.setFields([{ descriptor: PASSWORD, rect: box(40, 100) }]);
    };
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("signed");
    expect(typedInto(page)).toEqual(["shopper@example.com", "hunter2"]);
  });

  it("types no password when the step never comes", async () => {
    const page = new FakePage({
      url: PAGE,
      fields: [
        { descriptor: EMAIL, rect: box(10, 10) },
        { descriptor: PASSWORD, rect: box(0, 0, 0, 0) },
      ],
      points: { "110,25": EMAIL },
    });
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("no_password_field");
    expect(typedInto(page)).toEqual(["shopper@example.com"]);
  });
});

describe("a sign-in page that really has the box", () => {
  it("clicks the box and types into that focus", async () => {
    const page = new FakePage({
      url: PAGE,
      fields: [{ descriptor: PASSWORD, rect: box(40, 100) }],
      points: { "140,115": PASSWORD },
    });
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("signed");
    expect(page.relayed).toContainEqual({ action: "click", detail: "140,115" });
    expect(typedInto(page)).toEqual(["hunter2"]);
  });

  /** Aim is not permission here either: if the point is no longer the box it
   *  was aimed at, nothing is typed and nothing is submitted. */
  it("types nothing when the point is not that box any more", async () => {
    const page = new FakePage({
      url: PAGE,
      fields: [{ descriptor: PASSWORD, rect: box(40, 100) }],
      points: { "140,115": EMAIL },
    });
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("no_password_field");
    expect(typedInto(page)).toEqual([]);
    expect(page.relayed.some((move) => move.action === "key")).toBe(false);
  });
});
