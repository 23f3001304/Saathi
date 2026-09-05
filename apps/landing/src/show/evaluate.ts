import {
  HIDDEN,
  type Choreography,
  type Ease,
  type Frame,
  type ObjectId,
  type Pose,
  type Track,
} from "./contract.ts";

/*
 * The projector. Given the choreography and where the reader has scrolled
 * to, it returns one pose per object: pure arithmetic, no DOM, no clock, so
 * the same scroll position always draws the same picture and the whole show
 * is scrubbable in both directions.
 *
 * A keyframe carries only the fields it changes; everything else inherits
 * from the pose before it, and the first keyframe inherits from HIDDEN. That
 * is what lets a track read as "rise, then lean, then leave" instead of six
 * full poses repeated.
 */

const OVERSHOOT = 1.7;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** How far along the move is, given the curve the target keyframe asks for. */
export function easeAmount(ease: Ease | undefined, t: number): number {
  const k = clamp01(t);
  switch (ease) {
    case "in":
      return k * k * k;
    case "out":
      return 1 - (1 - k) ** 3;
    case "pop": {
      const back = k - 1;
      return 1 + (OVERSHOOT + 1) * back ** 3 + OVERSHOOT * back ** 2;
    }
    case "snap":
      // Nothing moves until the keyframe's own `at`, which is the next segment.
      return 0;
    default:
      return k;
  }
}

/* An overshooting curve is the point of "pop", so position is allowed past
   its target; opacity is not, because a puppet cannot be more visible than
   visible and the stage would clip it anyway. */
function mixPose(a: Pose, b: Pose, k: number): Pose {
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    z: lerp(a.z, b.z, k),
    rot: lerp(a.rot, b.rot, k),
    scale: lerp(a.scale, b.scale, k),
    opacity: clamp01(lerp(a.opacity, b.opacity, k)),
  };
}

const resolvedCache = new WeakMap<Track, readonly Pose[]>();

/** Each keyframe's full pose, inheriting forwards from HIDDEN. */
function resolved(track: Track): readonly Pose[] {
  const cached = resolvedCache.get(track);
  if (cached !== undefined) return cached;
  const poses: Pose[] = [];
  let prev: Pose = HIDDEN;
  for (const keyframe of track) {
    prev = { ...prev, ...keyframe.pose };
    poses.push(prev);
  }
  resolvedCache.set(track, poses);
  return poses;
}

/** The last keyframe that has begun, or -1 before the track starts. */
function segment(track: Track, progress: number): number {
  let i = -1;
  for (let n = 0; n < track.length; n += 1) {
    if (track[n].at > progress) break;
    i = n;
  }
  return i;
}

function poseAt(track: Track, progress: number): Pose {
  const poses = resolved(track);
  const i = segment(track, progress);
  if (i < 0) return HIDDEN;
  if (i >= track.length - 1) return poses[i];
  const from = track[i];
  const to = track[i + 1];
  const span = to.at - from.at;
  const t = span > 0 ? (progress - from.at) / span : 1;
  return mixPose(poses[i], poses[i + 1], easeAmount(to.ease, t));
}

/** One frame of the show at this scroll position. */
export function evaluate(
  choreography: Choreography,
  progress: number,
): Frame {
  const frame: Frame = {};
  for (const id of Object.keys(choreography) as ObjectId[]) {
    const track = choreography[id];
    if (track === undefined || track.length === 0) continue;
    frame[id] = poseAt(track, progress);
  }
  return frame;
}
