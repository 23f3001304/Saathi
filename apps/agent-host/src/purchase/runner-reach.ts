import type { SeeParts } from "../browser/app-see.js";
import type { Devices } from "../browser/devices.js";
import type { StateParts } from "../browser/app-state.js";
import type { CardVerbs } from "../browser/web-card.js";
import type { GlanceVerbs } from "../browser/web-glance.js";
import type { VerifyVerbs } from "../browser/web-verify.js";
import type { AskVerb } from "./ask-verb.js";

/**
 * The optional half of a runner's world. One object because they are one
 * idea, and because a tail of eight optional positionals had stopped
 * reading as anything. `research` arrives as a pair: `web_verify` fills the
 * table `web_card` is checked against, and a host wiring one without the
 * other would card rows off pages nobody opened.
 */
export interface RunnerReach {
  readonly research?: { verify: VerifyVerbs | null; card: CardVerbs | null };
  /** How the model asks; `null` where nobody is listening. */
  readonly ask?: AskVerb | null;
  readonly see?: SeeParts | null;
  /** The sandbox's mouse and keyboard. */
  readonly devices?: Devices | null;
  readonly glance?: GlanceVerbs | null;
  readonly state?: StateParts | null;
}
