import { fireEvent, render, screen } from "@testing-library/react";

import { App } from "../src/App.tsx";

/**
 * Through the doorstep and into one shop's console. Every page-level test goes
 * this way rather than mounting a page with hand-built props, because "which
 * merchant is this" is now established by the session and a test that skipped
 * the session would be testing a shape the product no longer has.
 */
export async function enterDesk(page?: string): Promise<void> {
  window.localStorage.clear();
  window.history.pushState(null, "", "/");
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /Continue as a demo shopkeeper/i }),
  );
  fireEvent.click(await screen.findByText("kolam-run"));
  await screen.findByRole("button", { name: /Why am I not being picked/i });
  if (page !== undefined) {
    fireEvent.click(await screen.findByRole("button", { name: page }));
  }
}
