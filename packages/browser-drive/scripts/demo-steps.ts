import type { GuardedPage } from "../src/drive/guarded-page.js";
import type { ActionResult } from "../src/drive/refusal.js";
import type { DrivenPage, Waiter } from "../src/ports.js";
import type { BrowserSession } from "../src/session/browser-session.js";

export interface DemoContext {
  readonly session: BrowserSession;
  readonly page: GuardedPage;
  /**
   * The raw page, standing in for the user's hands. It deliberately sits
   * *outside* `GuardedPage`: during user-drive the agent can do nothing, and
   * the only way to move the demo forward is the way a person would — by
   * acting on the window directly.
   */
  readonly hands: DrivenPage;
  readonly waiter: Waiter;
}

export function say(line: string): void {
  console.log(line);
}

export function step(n: number, title: string): void {
  console.log(`\n${"─".repeat(72)}\n${n}. ${title}\n${"─".repeat(72)}`);
}

/** Prints an allowed action or the refusal that replaced it. */
export function report<T>(label: string, result: ActionResult<T>): void {
  if (result.ok) {
    say(`  OK       ${label}`);
    return;
  }
  say(`  REFUSED  ${label}`);
  say(`           rule: ${result.rule}`);
  if (result.category !== null) {
    say(`           category: ${result.category}`);
  }
  say(`           "${result.human}"`);
}

export async function browse(
  ctx: DemoContext,
  home: string,
  product: string,
): Promise<void> {
  report("navigate to the shop", await ctx.page.navigate(home));
  report(
    'type "trail shoes" into the search box',
    await ctx.page.type("#q", "trail shoes"),
  );
  report("navigate to the product", await ctx.page.navigate(product));
  report("click Add to cart", await ctx.page.click("#add-to-cart"));
}

export async function readCart(ctx: DemoContext, cart: string): Promise<void> {
  report("navigate to the cart", await ctx.page.navigate(cart));
  const reading = await ctx.session.review().inspect(ctx.page);
  say(
    `  cart total: ${reading.totalPaise} paise (confidence: ${reading.confidence})`,
  );
  for (const item of reading.items) {
    say(`    - ${item.qty} x ${item.label} = ${item.linePaise} paise`);
  }
}

/** The proof that matters: the agent tries, and the harness refuses. */
export async function provokeLoginBlock(
  ctx: DemoContext,
  login: string,
): Promise<void> {
  report("navigate to the sign-in page", await ctx.page.navigate(login));
  report("type the password", await ctx.page.type("#password", "hunter2"));
  say(`  session state: ${ctx.session.currentState()}`);
  say(`  handoff: ${JSON.stringify(ctx.session.handoff().current())}`);
}

export async function proveFrozen(ctx: DemoContext): Promise<void> {
  for (const attempt of ["type", "click"] as const) {
    try {
      await (attempt === "type"
        ? ctx.page.type("#email", "someone@example.com")
        : ctx.page.click("#sign-in"));
      say(`  UNEXPECTED: ${attempt} succeeded while the user was driving`);
    } catch (error) {
      say(`  THREW    ${attempt}: ${(error as Error).message}`);
    }
  }
}

export async function userSignsIn(ctx: DemoContext): Promise<void> {
  say("  (the user types into the visible window — the agent is not involved)");
  await ctx.hands.typeInto("#email", "fixture@example.com");
  await ctx.hands.typeInto("#password", "hunter2");
  await ctx.hands.clickOn("#sign-in");
  await ctx.waiter.sleep(600);
  say(`  the window is now at: ${ctx.hands.url()}`);
}

export async function suggestResume(ctx: DemoContext): Promise<void> {
  const readiness = await ctx.session.handoff().waitForUserCompletion();
  say(`  ready: ${readiness.ready} after ${readiness.polls} poll(s)`);
  for (const signal of readiness.signals) {
    say(
      `    ${signal.met ? "met " : "not "} ${signal.name} (${signal.detail})`,
    );
  }
  say(`  "${readiness.human}"`);
  say(`  state before resume: ${ctx.session.currentState()}`);
  ctx.session.handoff().resume();
  say(`  state after the user asked to resume: ${ctx.session.currentState()}`);
}

export async function provokePaymentBlock(
  ctx: DemoContext,
  checkout: string,
): Promise<void> {
  report("navigate to checkout", await ctx.page.navigate(checkout));
  report(
    "type the card number",
    await ctx.page.type("#card-number", "4111111111111111"),
  );
  ctx.session.handoff().resume();
  report("click Place order", await ctx.page.click("#place-order"));
  ctx.session.handoff().resume();
  report("click भुगतान करें", await ctx.page.click("#pay-hindi"));
  ctx.session.handoff().resume();
}

export async function finalReview(
  ctx: DemoContext,
  capPaise: number,
): Promise<void> {
  say(`  covenant cap: ${capPaise} paise`);
  const result = await ctx.session.review().run(ctx.page);
  report("request the final-review handoff", result);
  say(
    `  handoff after the check: ${JSON.stringify(ctx.session.handoff().current())}`,
  );
  say(`  state: ${ctx.session.currentState()}`);
}
