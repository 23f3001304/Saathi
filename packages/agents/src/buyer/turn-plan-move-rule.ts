import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  PICK_TOOL,
  PROPOSE_TOOL,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
  WEB_LOOK_TOOL,
} from "./turn-plan.js";

/** The half of the closing that decides which move this turn is. Split from
 *  `turn-plan-prompt.ts` when v11's ceiling sentence took the one function
 *  past its line bound; the prose and its order are unchanged. */
export function moveRule(): string {
  return webRule() + shopRule();
}

/** Going out to the open web: what the errand costs, and what has to be in
 *  hand before it is worth spending. */
function webRule(): string {
  return (
    `Second, the move. A read (${SEE_SHELF_TOOL}, ${SEE_STATE_TOOL}) is not ` +
    "a move: look first when the answer depends on what is there, then call " +
    "exactly one move, and pick it by what that quoted line names.\n" +
    `A shop outside this one - a marketplace, a brand's own site - is ${WEB_LOOK_TOOL}. ` +
    "A web look is an errand: it opens a window they watch and costs them a wait, " +
    "so it is worth spending only on a thing you could recognise on a page. " +
    "Before you go, hold three things: what exactly (the thing, with the details " +
    "that change which one is right: size, capacity, internal or external, colour, " +
    "model), the most they will spend, and anything it must be (returnable, a " +
    "particular shop, a delivery they need). Take each from what they wrote, from " +
    "the key: value facts about them and from what they said earlier in this " +
    "conversation; what you still cannot fill, ask for once, all of it in one " +
    "question, with the likely answers in replies. When you hold those three, go " +
    `this turn, and the query you hand ${WEB_LOOK_TOOL} is what you would type ` +
    "yourself for exactly their thing: their own product words, the detail that " +
    "narrows it, and the shop if they named one. Never a generic phrase.\n" +
    "A rough figure is a figure: '₹50,000+' or 'around 60k' is the ceiling, " +
    "and you never ask for an exact amount once any amount has been given.\n"
  );
}

/** The moves that stay inside this shop and the screen they are looking at. */
function shopRule(): string {
  return (
    "Their words choosing one of the cards on their screen (" +
    `${SEE_STATE_TOOL} lists them with their refs) is ${PICK_TOOL}: name the ` +
    "ref, and the host takes the same path a tap on that card takes. If " +
    "more than one card fits what they said, ask which.\n" +
    `What they can see in THIS shop is ${BROWSE_TOOL}: read the shelf with ` +
    `${SEE_SHELF_TOOL}, then name the skus you would put in front of them; ` +
    "the cards are built from the shelf, not from your words.\n" +
    `A thing to buy from this shop and a ceiling to spend is ${PROPOSE_TOOL}: ` +
    "name the sku off the shelf and the most they should spend, from what " +
    "they said; the sheet they sign shows exactly those numbers. Draft it, " +
    "rather than checking whether they meant it. The hold-to-sign is the " +
    "only consent this turn collects, and the signature is their answer - " +
    "so a reply whose move already acts never ends by asking permission to " +
    "act. If something genuinely needs their say-so first, the move was " +
    `${ANSWER_TOOL}, not a question stapled to an action.\n` +
    `${ANSWER_TOOL} is for the one thing no amount of looking could have ` +
    "told you. Ask for it once. If your last [you] line already asked and " +
    "that quoted line answers it, you have it: act on it, and never put the " +
    "same question a second time in different words."
  );
}
