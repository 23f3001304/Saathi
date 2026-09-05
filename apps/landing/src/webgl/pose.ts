/**
 * Putting a frame of the choreography onto the objects. One pose per id, and
 * HIDDEN for anything the frame does not mention.
 */
import { Mesh, type Material, type Object3D } from "three";

import { HIDDEN, type Frame, type ObjectId, type Pose } from "../show/contract.ts";

/** Each material's alpha test as it was authored, before any fade scaled it. */
const authored = new WeakMap<Material, number>();

function baseAlphaTest(material: Material): number {
  const known = authored.get(material);
  if (known !== undefined) return known;
  authored.set(material, material.alphaTest);
  return material.alphaTest;
}

/**
 * Fading a cutout is not only opacity. The alpha test compares texture alpha
 * TIMES opacity against alphaTest, so a plain fade would make a piece vanish
 * whole the moment it passed under half. Scaling the test by the same opacity
 * keeps the cut silhouette identical all the way down, and the shadow pass
 * goes on cutting that same shape.
 */
function fade(material: Material, opacity: number): void {
  material.opacity = opacity;
  const base = baseAlphaTest(material);
  if (base > 0) material.alphaTest = base * Math.max(opacity, 0.05);
}

function fadeTree(object: Object3D, opacity: number): void {
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const material: Material | Material[] = node.material;
    if (Array.isArray(material)) material.forEach((one) => { fade(one, opacity); });
    else fade(material, opacity);
  });
}

/** Position, lean about the base, scale, opacity, and gone below zero. */
export function applyPose(object: Object3D, pose: Pose): void {
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.z = pose.rot;
  object.scale.setScalar(pose.scale);
  object.visible = pose.opacity > 0;
  if (object.visible) fadeTree(object, pose.opacity);
}

export function applyFrame(objects: ReadonlyMap<ObjectId, Object3D>, frame: Frame): void {
  for (const [id, object] of objects) applyPose(object, frame[id] ?? HIDDEN);
}
