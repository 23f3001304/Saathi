/**
 * The contract between the choreography (what the story wants each thing to
 * do at a point in the scroll) and the WebGL stage (which draws it).
 *
 * Stage space: metres, right-handed. The floor is y = 0, the stage opening
 * is 3 units wide (x from -1.5 to 1.5) at z = 0, depth goes away from the
 * camera into negative z. Puppets stand at z = 0; the near flats at -0.6;
 * the mid flats at -1.4; the far flats at -2.4; the back wall at -3.2. The
 * proscenium hangs in front at z = 0.6, the footlights at 0.5, the curtain
 * at 0.45. The camera rests at (0, 1.05, 5.2) looking at (0, 0.95, 0) with a
 * 32 degree vertical field of view.
 */
export const STAGE = {
  width: 3,
  height: 2,
  z: {
    proscenium: 0.6,
    footlights: 0.5,
    curtain: 0.45,
    cast: 0,
    near: -0.6,
    mid: -1.4,
    far: -2.4,
    wall: -3.2,
  },
  camera: { position: [0, 1.05, 5.2], target: [0, 0.95, 0], fov: 32 },
} as const;

/** Everything the choreography can move. Ids are stable; the scene builds
 *  one object per id and the choreography owns one track per id. */
export type ObjectId =
  | "curtainLeft"
  | "curtainRight"
  | "cloudA"
  | "cloudB"
  | "cloudC"
  | "goldArch"
  | "redBuilding"
  | "stallTeal"
  | "stallIndigo"
  | "saathi"
  | "shopper"
  | "shopkeeper"
  | "tout"
  | "slip"
  | "stamp1"
  | "stamp2"
  | "stamp3"
  | "tag1"
  | "tag2"
  | "tag3"
  | "nightFar"
  | "nightMid"
  | "nightNear"
  | "lamp"
  | "scroll"
  | "backPlate"
  | "night";

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rotation about the object's base, radians, positive leans right. */
  readonly rot: number;
  readonly scale: number;
  readonly opacity: number;
}

export const HIDDEN: Pose = { x: 0, y: -2.5, z: 0, rot: 0, scale: 1, opacity: 0 };

/** One frame of the show: a pose for every object. Missing ids are HIDDEN. */
export type Frame = Partial<Record<ObjectId, Pose>>;

export type Ease = "linear" | "out" | "in" | "pop" | "snap";

export interface Keyframe {
  /** Scroll progress, 0 at the top of the page and 1 at the bottom. */
  readonly at: number;
  readonly pose: Partial<Pose>;
  /** How this keyframe is reached from the previous one. */
  readonly ease?: Ease;
}

export type Track = readonly Keyframe[];

export type Choreography = Partial<Record<ObjectId, Track>>;

/** A moment in the story: when it starts, what is said, what is read. */
export interface Beat {
  readonly id: string;
  readonly at: number;
  /** Which recorded line plays as this beat begins, if the sound is on. */
  readonly voice?: string;
  /** The subtitle on screen while this beat runs, until the next caption. */
  readonly caption?: string;
  /** A title card line, larger than a caption, for the few beats that carry one. */
  readonly title?: string;
}

/** What the stage gets every animation frame. */
export interface Tick {
  readonly progress: number;
  /** Pointer position over the viewport in -1..1, zero when absent. */
  readonly pointerX: number;
  readonly pointerY: number;
  readonly dtMs: number;
}
