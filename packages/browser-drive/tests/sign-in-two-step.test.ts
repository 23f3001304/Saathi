import { describe, expect, it } from "vitest";

import { FakePage } from "./fake-page.js";
import {
  box,
  CREDS,
  driveOver,
  EMAIL,
  fieldOf,
  PAGE,
  PASSWORD,
  typedInto,
} from "./support/sign-in-fixtures.js";

/** A third ask, on a form that is visibly not either of the first two. */
const SECOND_PASSWORD = fieldOf({
  selector: "#ap_password_again",
  inputType: "password",
  name: "password",
  labelText: "Password",
  autocomplete: "current-password",
});

const POINTS = {
  "110,25": EMAIL,
  "110,65": PASSWORD,
  "140,115": PASSWORD,
  "140,215": SECOND_PASSWORD,
};

function bothBoxes(): FakePage {
  return new FakePage({
    url: PAGE,
    fields: [
      { descriptor: EMAIL, rect: box(10, 10) },
      { descriptor: PASSWORD, rect: box(10, 50) },
    ],
    points: POINTS,
  });
}

/**
 * The shape the shopper reported: Amazon shows an email box and a password box
 * on one page, consumes only the email when Continue is pressed, and then
 * swaps in the real password step. A sign-in that stopped at the Enter key
 * reported success over a form still asking, and the shopper was told to read
 * the page and carry on.
 */
describe("a shop that shows both boxes and then asks again", () => {
  it("submits the second step instead of reporting the first as done", async () => {
    const page = bothBoxes();
    let keys = 0;
    page.onKey = () => {
      keys += 1;
      // Enter one takes only the email. Enter two signs in.
      if (keys === 1) {
        page.setFields([{ descriptor: PASSWORD, rect: box(40, 100) }]);
      } else page.setFields([]);
    };
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("signed");
    expect(report.named).toBe(true);
    expect(typedInto(page)).toEqual([
      "shopper@example.com",
      "hunter2",
      "hunter2",
    ]);
  });

});

/** Two sends is a form that asks in two steps. Anything past that is the
 *  shop refusing what the vault holds, and the window is the shopper's. */
describe("what stops a password going in a second time", () => {
  /**
   * Re-typing a password into a page that simply has not navigated yet is how
   * an account gets locked, so an unchanged form is the same ask, waited on.
   */
  it("does not send the password twice into a page that has not moved", async () => {
    const page = bothBoxes();
    page.onKey = () => {
      /* The page stays exactly as it was. */
    };
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("signed");
    expect(typedInto(page)).toEqual(["shopper@example.com", "hunter2"]);
  });

  it("stops at two sends and hands a third ask over as a challenge", async () => {
    const page = bothBoxes();
    let keys = 0;
    page.onKey = () => {
      keys += 1;
      if (keys === 1) {
        page.setFields([{ descriptor: PASSWORD, rect: box(40, 100) }]);
      } else {
        page.setFields([{ descriptor: SECOND_PASSWORD, rect: box(40, 200) }]);
      }
    };
    const report = await driveOver(page).into(CREDS);
    expect(report.state).toBe("challenged");
    expect(typedInto(page)).toEqual([
      "shopper@example.com",
      "hunter2",
      "hunter2",
    ]);
  });
});
