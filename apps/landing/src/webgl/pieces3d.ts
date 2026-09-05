/**
 * Turning a flat cutout into a thing standing on the stage: a plane sized from
 * the artwork's own pixels, with its anchor (a puppet's feet, a prop's middle)
 * translated onto the mesh origin so the choreography's pose means what it
 * says.
 */
import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";

import { PIECES, pieceSrc, type PieceName } from "../stage/pieces.ts";
import { anchorLift, planeForHeight, planeForWidth, type Anchor, type PlaneSize } from "./math.ts";
import { cutoutMaterial, flatMaterial, loadCutout, type CutoutOptions } from "./textures.ts";

export interface CutoutMeshOptions extends CutoutOptions {
  /** Where the pose's position lands on the piece. Bottom centre by default. */
  readonly anchor?: Anchor;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /** A silhouette that takes no light: the night skyline. */
  readonly unlit?: boolean;
}

/** The height a piece takes when it is the width that matters (wide strips). */
export function heightAcross(piece: PieceName, widthMetres: number): number {
  return planeForWidth(PIECES[piece], widthMetres).height;
}

/** A plane of a given size in stage units, anchored and ready to be lit. */
export function planeMesh(size: PlaneSize, material: Material, anchor: Anchor = "centre"): Mesh {
  const geometry = new PlaneGeometry(size.width, size.height);
  geometry.translate(0, anchorLift(size.height, anchor), 0);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function materialFor(texture: Texture, opts: CutoutMeshOptions): Material {
  if (opts.unlit === true) return flatMaterial(texture, opts.colour);
  return cutoutMaterial(texture, opts);
}

/** One piece of the show, `heightMetres` tall, as wide as its pixels ask. */
export async function cutoutMesh(
  piece: PieceName,
  heightMetres: number,
  opts: CutoutMeshOptions = {},
): Promise<Mesh> {
  const texture = await loadCutout(pieceSrc(piece));
  const size = planeForHeight(PIECES[piece], heightMetres);
  const mesh = planeMesh(size, materialFor(texture, opts), opts.anchor ?? "bottom");
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  mesh.name = piece;
  return mesh;
}

function release(material: Material): void {
  if (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) {
    material.map?.dispose();
  }
  material.dispose();
}

/** Gives back every geometry, material and texture under a node, on dispose. */
export function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const material: Material | Material[] = node.material;
    if (Array.isArray(material)) material.forEach(release);
    else release(material);
  });
}
