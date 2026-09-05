import { describe, expect, it } from "vitest";

import { FakePage } from "./fake-page.js";
import {
  box,
  CREDS,
  driveOver,
  EMAIL,
  PAGE,
  PASSWORD,
  typedInto,
} from "./support/sign-in-fixtures.js";

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
