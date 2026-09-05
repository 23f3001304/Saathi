import { STAGE, type Choreography, type Keyframe, type Pose } from "./contract.ts";

/** The set: curtains, sky, flats, props and the night. The cast is in
 *  choreography.ts; both are merged there. Positions are stage metres. */
const Z = STAGE.z;

export function kf(at: number, pose: Partial<Pose>, ease?: Keyframe["ease"]): Keyframe {
  return ease === undefined ? { at, pose } : { at, pose, ease };
}

/** A thing standing on the floor, fully shown. */
export function standing(x: number, z: number): Partial<Pose> {
  return { x, y: 0, z, rot: 0, scale: 1, opacity: 1 };
}

const OPEN_L = -1.62;
const OPEN_R = 1.62;
const CLOSED = 0.72;

export const CURTAINS: Choreography = {
  curtainLeft: [
    kf(0, { x: -CLOSED, y: 0.05, z: Z.curtain, rot: 0, scale: 1, opacity: 1 }),
    kf(0.045, { x: OPEN_L }, "out"),
    kf(0.93, { x: OPEN_L }),
    kf(0.965, { x: -CLOSED }, "out"),
  ],
  curtainRight: [
    kf(0, { x: CLOSED, y: 0.05, z: Z.curtain, rot: 0, scale: 1, opacity: 1 }),
    kf(0.045, { x: OPEN_R }, "out"),
    kf(0.93, { x: OPEN_R }),
    kf(0.965, { x: CLOSED }, "out"),
  ],
};

function cloud(x: number, y: number, drift: number, from: number): Keyframe[] {
  const z = Z.far + 0.15;
  return [
    kf(0, { x: x + from, y, z, rot: 0, scale: 1, opacity: 0 }),
    kf(0.06, { x, opacity: 1 }, "out"),
    kf(0.68, { x: x + drift, opacity: 1 }, "linear"),
    kf(0.72, { opacity: 0 }, "out"),
    kf(0.84, { x: x + drift, opacity: 0 }),
    kf(0.88, { opacity: 1 }, "out"),
  ];
}

export const SKY: Choreography = {
  cloudA: cloud(-0.95, 1.55, 0.35, -0.6),
  cloudB: cloud(0.7, 1.72, -0.25, 0.7),
  cloudC: cloud(1.15, 1.42, 0.2, 0.5),
};

/** The day flats: in place from the start, drifting against Saathi's walk,
 *  gone for the night and back for the call. */
function flat(x: number, z: number, walkShift: number): Keyframe[] {
  return [
    kf(0, standing(x, z)),
    kf(0.34, standing(x, z)),
    kf(0.46, { x: x - walkShift }, "linear"),
    kf(0.68, { x: x - walkShift }),
    kf(0.72, { opacity: 0, y: -0.2 }, "out"),
    kf(0.84, { opacity: 0, y: -0.2 }),
    kf(0.88, { opacity: 1, y: 0 }, "out"),
  ];
}

export const FLATS: Choreography = {
  goldArch: flat(0.05, Z.far, 0.3),
  stallTeal: flat(-0.98, Z.mid, 0.55),
  stallIndigo: flat(0.98, Z.mid, 0.55),
  redBuilding: [
    kf(0.34, { ...standing(2.4, Z.far), opacity: 0 }),
    kf(0.36, { opacity: 1 }),
    kf(0.46, { x: 1.35 }, "linear"),
    kf(0.68, { x: 1.35 }),
    kf(0.72, { opacity: 0, y: -0.2 }, "out"),
  ],
};

/** Three price tags nobody asked for: they drop in, then get knocked off. */
function tag(at: number, x: number, y: number, rot: number): Keyframe[] {
  const z = Z.near + 0.25;
  return [
    kf(at, { x, y: y + 1.2, z, rot, scale: 1, opacity: 0 }),
    kf(at + 0.02, { y, opacity: 1 }, "pop"),
    kf(0.205, { y, rot }),
    kf(0.225, { y: -1.4, rot: rot + 0.9, opacity: 0 }, "in"),
  ];
}

export const PROPS: Choreography = {
  tag1: tag(0.15, -0.55, 1.25, -0.12),
  tag2: tag(0.165, 0.05, 1.42, 0.08),
  tag3: tag(0.18, 0.62, 1.2, -0.05),
  slip: [
    kf(0.255, { x: 0.68, y: 1.28, z: Z.near + 0.3, rot: -0.06, scale: 0.6, opacity: 0 }),
    kf(0.275, { scale: 1, opacity: 1 }, "pop"),
    kf(0.335, { scale: 1, opacity: 1 }),
    kf(0.35, { y: 2.6, opacity: 0 }, "in"),
  ],
  stamp1: stamp(0.578, 0.42, 0.95, -0.16),
  stamp2: stamp(0.608, 0.88, 1.12, 0.12),
  stamp3: stamp(0.638, 0.62, 1.32, -0.28),
  backPlate: [
    kf(0.47, { x: 0, y: 1.05, z: 0.4, rot: 0, scale: 1, opacity: 0 }),
    kf(0.49, { opacity: 1 }, "out"),
    kf(0.52, { opacity: 1 }),
    kf(0.535, { opacity: 0 }, "out"),
  ],
};

function stamp(at: number, x: number, y: number, rot: number): Keyframe[] {
  return [
    kf(at, { x, y, z: Z.near + 0.35, rot, scale: 1.9, opacity: 0 }),
    kf(at + 0.012, { scale: 1, opacity: 1 }, "pop"),
    kf(0.685, { scale: 1, opacity: 1 }),
    kf(0.705, { opacity: 0 }, "out"),
  ];
}

/** Lights down, the backlit box, the lamp and the bill; up again for the call. */
export const NIGHT: Choreography = {
  night: [
    kf(0.68, { x: 0, y: 0, z: 0, rot: 0, scale: 1, opacity: 0 }),
    kf(0.72, { opacity: 1 }, "out"),
    kf(0.83, { opacity: 1 }),
    kf(0.86, { opacity: 0 }, "out"),
  ],
  nightFar: layer(Z.far),
  nightMid: layer(Z.mid),
  nightNear: layer(Z.near),
  lamp: [
    kf(0.70, { x: -0.28, y: -0.3, z: Z.near + 0.4, rot: 0, scale: 1, opacity: 0 }),
    kf(0.725, { y: 0.02, opacity: 1 }, "pop"),
    kf(0.83, { y: 0.02, opacity: 1 }),
    kf(0.85, { y: -0.3, opacity: 0 }, "in"),
  ],
  scroll: [
    kf(0.74, { x: 0.5, y: 1.7, z: Z.near + 0.35, rot: 0.02, scale: 1, opacity: 0 }),
    kf(0.775, { y: 1.08, opacity: 1 }, "out"),
    kf(0.83, { y: 1.08, opacity: 1 }),
    kf(0.85, { y: 1.7, opacity: 0 }, "in"),
  ],
};

function layer(z: number): Keyframe[] {
  return [
    kf(0.68, { x: 0, y: 0, z, rot: 0, scale: 1, opacity: 0 }),
    kf(0.72, { opacity: 1 }, "out"),
    kf(0.83, { opacity: 1 }),
    kf(0.86, { opacity: 0 }, "out"),
  ];
}
