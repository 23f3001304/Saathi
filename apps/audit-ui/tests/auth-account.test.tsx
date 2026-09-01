// The account chrome once someone is in: whose name it shows, what it says
// about the key, and the one assertion this whole feature exists to make —
// a Google profile, however complete, is never purchase authority.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  Flow,
  googleFactory,
  mount,
  Probe,
  resetAuthEnvironment,
  seedStoredSession,
  stubBrowserGaps,
} from "./support/authHarness.tsx";
import { AccountMenu } from "../src/chrome/AccountMenu.tsx";

vi.mock("motion", () => ({ animate: () => undefined, stagger: () => 0 }));

const ACCOUNT = { name: "Account" };
const TRIGGER = { name: "trigger sign-in" };

beforeAll(stubBrowserGaps);
beforeEach(resetAuthEnvironment);
afterEach(() => vi.unstubAllEnvs());

describe("a Google profile alone is never purchase authority", () => {
  it("lands a fully-identified Google user in the ceremony, not in the app", async () => {
    mount(
      <>
        <Flow />
        <Probe />
      </>,
      googleFactory,
    );
    fireEvent.click(screen.getByRole("button", TRIGGER));

    expect(await screen.findByText("Now, the pen.")).toBeDefined();
    expect(screen.queryByText("Chat")).toBeNull();
    expect(screen.getByTestId("authority").textContent).toBe("cannot-sign");
  });

  it("reports no signing capability in the account menu until the key exists", async () => {
    mount(
      <>
        <AccountMenu />
        <Probe />
      </>,
      googleFactory,
    );
    fireEvent.click(screen.getByRole("button", TRIGGER));
    fireEvent.click(await screen.findByRole("button", ACCOUNT));

    expect(screen.getByText("none: nothing can be bought")).toBeDefined();
    expect(screen.getByText("Google · mehang@example.com")).toBeDefined();
  });
});

describe("the account menu shows the real person, and its sign-out clears them", () => {
  it("restores a stored session and renders the profile beside the key", async () => {
    seedStoredSession();
    mount(<AccountMenu />, googleFactory);
    fireEvent.click(await screen.findByRole("button", ACCOUNT));

    expect(screen.getByText("Mehang")).toBeDefined();
    expect(screen.getByText("Google · mehang@example.com")).toBeDefined();
    expect(screen.getByText("9f2c4d1a77b03e58")).toBeDefined();
  });

  it("keeps the two rows separate, and says which one can spend", async () => {
    seedStoredSession();
    mount(<AccountMenu />, googleFactory);
    fireEvent.click(await screen.findByRole("button", ACCOUNT));

    expect(screen.getByText("Signed in with")).toBeDefined();
    expect(screen.getByText("Signing key")).toBeDefined();
    expect(
      screen.getByText(/only the key can approve a purchase/),
    ).toBeDefined();
  });

  it("wipes the stored session on sign out", async () => {
    seedStoredSession();
    mount(<AccountMenu />, googleFactory);
    fireEvent.click(await screen.findByRole("button", ACCOUNT));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(window.localStorage.getItem("covenant-auth")).toBeNull();
    expect(screen.queryByText("Mehang")).toBeNull();
  });
});
