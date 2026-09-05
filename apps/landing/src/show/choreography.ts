import { CURTAINS, FLATS, NIGHT, PROPS, SKY, kf, standing } from "./choreography-set.ts";
import { STAGE, type Choreography, type Keyframe } from "./contract.ts";

/** How tall the page is, in viewport heights: the whole show at one scroll. */
export const SCROLL_VH = 1300;

const Z = STAGE.z.cast;
/** A puppet waiting below the footlights. */
const BELOW = -1.5;

/** Rises from below the floor at `at`, with the hand's overshoot. */
function rise(at: number, x: number): Keyframe[] {
  return [kf(at, { ...standing(x, Z), y: BELOW }), kf(at + 0.022, { y: 0 }, "pop")];
}

/** Drops out of sight at `at`, quickly. */
function drop(at: number): Keyframe[] {
  return [kf(at, { y: 0 }), kf(at + 0.014, { y: BELOW }, "in")];
}

/** One bow: a nod from the base of the stick and back. */
function bow(at: number): Keyframe[] {
  return [kf(at, { rot: 0 }), kf(at + 0.012, { rot: -0.22 }, "out"), kf(at + 0.026, { rot: 0 }, "out")];
}

/** The four in a row for the curtain call, bowing in order of appearance. */
function call(at: number, x: number): Keyframe[] {
  return [...rise(at, x), ...bow(at + 0.03)];
}

const CAST: Choreography = {
  saathi: [
    ...rise(0.222, 0),
    kf(0.34, { x: 0 }),
    kf(0.46, { x: 0.42 }, "linear"),
    kf(0.52, { x: 0.42 }),
    kf(0.545, { x: -0.55 }, "out"),
    kf(0.575, { rot: 0 }),
    kf(0.582, { rot: -0.12 }, "out"),
    kf(0.59, { rot: 0 }, "out"),
    kf(0.605, { rot: 0 }),
    kf(0.612, { rot: -0.12 }, "out"),
    kf(0.62, { rot: 0 }, "out"),
    kf(0.635, { rot: 0 }),
    kf(0.642, { rot: -0.12 }, "out"),
    kf(0.65, { rot: 0 }, "out"),
    kf(0.69, { x: -0.55 }),
    kf(0.72, { x: -0.72 }, "out"),
    ...drop(0.835),
    ...call(0.852, -1.05),
    ...drop(0.925),
  ],
  shopper: [
    ...rise(0.078, -0.72),
    kf(0.26, { x: -0.72 }),
    kf(0.275, { x: -0.86 }, "out"),
    ...drop(0.335),
    ...call(0.862, -0.35),
    ...drop(0.925),
  ],
  shopkeeper: [
    ...rise(0.392, 1.02),
    kf(0.50, { x: 1.02 }),
    ...drop(0.505),
    ...call(0.872, 0.35),
    ...drop(0.925),
  ],
  tout: [
    ...rise(0.553, 0.72),
    ...drop(0.576),
    ...rise(0.584, 0.72),
    ...drop(0.606),
    ...rise(0.614, 0.72),
    kf(0.66, { y: 0 }),
    kf(0.668, { y: BELOW }, "in"),
    ...call(0.882, 1.05),
    ...drop(0.925),
  ],
};

/** Every track of the show, merged. Ids are unique across the parts. */
export const CHOREOGRAPHY: Choreography = {
  ...CURTAINS,
  ...SKY,
  ...FLATS,
  ...PROPS,
  ...NIGHT,
  ...CAST,
};
