import { CollectingJournalSink, Journal } from "../../src/journal.js";
import { FieldClassifier } from "../../src/field/field-classifier.js";
import { SignInDrive } from "../../src/drive/sign-in.js";
import { SessionStateMachine } from "../../src/session-state.js";
import type { ElementDescriptor } from "../../src/field/element-descriptor.js";
import type { FakePage } from "../fake-page.js";
import { FixedClock } from "../fakes.js";

export const CREDS = {
  username: "shopper@example.com",
  password: "hunter2",
};

export const PAGE = "https://amazon.in/ap/signin";

export function fieldOf(over: Partial<ElementDescriptor>): ElementDescriptor {
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

export const EMAIL = fieldOf({
  selector: "#ap_email",
  inputType: "email",
  name: "email",
  labelText: "Email",
});

export const PASSWORD = fieldOf({
  selector: "#ap_password",
  inputType: "password",
  name: "password",
  labelText: "Password",
  autocomplete: "current-password",
});

export function box(x: number, y: number, width = 200, height = 30) {
  return { x, y, width, height };
}

export function driveOver(page: FakePage): SignInDrive {
  const state = new SessionStateMachine();
  state.transition("agent-drive");
  return new SignInDrive(
    page,
    new FieldClassifier(),
    state,
    new Journal(new CollectingJournalSink(), new FixedClock(), "web_t"),
  );
}

/** Every string this sign-in put on a page, in order. */
export function typedInto(page: FakePage): readonly string[] {
  return page.relayed
    .filter((move) => move.action === "type")
    .map((move) => move.detail);
}
