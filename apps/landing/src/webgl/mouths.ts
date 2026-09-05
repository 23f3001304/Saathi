/**
 * Mouths. A puppet that speaks swaps its cutout for `<name>-open.webp`. Those
 * files may never be baked, so the open texture is asked for once, on the
 * first line that puppet speaks, and a miss is remembered as a no-op rather
 * than retried.
 *
 * The swap sets `material.map` and nothing else: the two textures are cut the
 * same way, so the shader is unchanged and no recompile is needed. Marking the
 * material for an update here would hitch the frame on every syllable.
 */
import { Mesh, MeshStandardMaterial, type Object3D, type Texture } from "three";

import type { ObjectId } from "../show/contract.ts";
import { pieceSrc } from "../stage/pieces.ts";
import { PUPPET_IDS, type PuppetId } from "./objects.ts";
import { loadCutout } from "./textures.ts";

export interface Face {
  readonly group: Object3D;
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly shut: Texture;
  /** The open mouth, once it has arrived. Stays null if there is no such file. */
  open: Texture | null;
  asked: boolean;
}

export type Faces = Map<PuppetId, Face>;

export function isPuppet(id: ObjectId): id is PuppetId {
  return (PUPPET_IDS as readonly ObjectId[]).includes(id);
}

function faceOf(group: Object3D, id: PuppetId): Face | null {
  const mesh = group.getObjectByName(`${id}:face`);
  if (!(mesh instanceof Mesh)) return null;
  const material: unknown = mesh.material;
  if (!(material instanceof MeshStandardMaterial) || material.map === null) return null;
  return { group, mesh, material, shut: material.map, open: null, asked: false };
}

/** Finds the cutout inside each puppet group, once, after the build. */
export function collectFaces(objects: ReadonlyMap<ObjectId, Object3D>): Faces {
  const faces: Faces = new Map();
  for (const id of PUPPET_IDS) {
    const group = objects.get(id);
    const face = group === undefined ? null : faceOf(group, id);
    if (face !== null) faces.set(id, face);
  }
  return faces;
}

function askForMouth(face: Face, id: PuppetId): void {
  face.asked = true;
  void loadCutout(pieceSrc(id).replace(".webp", "-open.webp"))
    .then((texture) => { face.open = texture; })
    .catch(() => undefined);
}

export function setMouthOn(faces: Faces, id: PuppetId, open: boolean): void {
  const face = faces.get(id);
  if (face === undefined) return;
  if (!face.asked) askForMouth(face, id);
  const wanted = open && face.open !== null ? face.open : face.shut;
  if (face.material.map !== wanted) face.material.map = wanted;
}
