/**
 * The theatre itself: the box the puppets are played inside. The wall, floor,
 * proscenium and footlights never move. The curtain halves and the back plate
 * do, so they are handed back as movable objects for the choreography.
 *
 * A curtain is anchored at its outer bottom corner, not its middle, so that
 * `x = -1.5` (and `x = 1.5` for the mirrored half) hangs it exactly on the
 * edge of the opening and larger values of x draw it across.
 */
import { Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Object3D } from "three";

import { STAGE, type ObjectId } from "../show/contract.ts";
import { PIECES, pieceSrc } from "../stage/pieces.ts";
import { wallTexture } from "./canvas.ts";
import { clamp01, planeForHeight } from "./math.ts";
import { cutoutMesh, heightAcross, planeMesh } from "./pieces3d.ts";
import { cutoutMaterial, loadCutout } from "./textures.ts";

const CURTAIN_HEIGHT = 1.9;
const DAY_WALL = new Color(0xffffff);
const DAY_FLOOR = new Color(0xd9c7a3);
const NIGHT_WALL = new Color(0x1d1540);
const NIGHT_FLOOR = new Color(0x2b2547);

export interface Theatre {
  readonly group: Group;
  /** The two curtain halves and the back plate, by choreography id. */
  readonly movable: Map<ObjectId, Object3D>;
  setNight(amount: number): void;
}

interface Painted {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
}

/*
 * The wall is sized by projection, not by taste. From the contract's camera
 * the wall plane is 1.826 times further out than the proscenium, so filling
 * the arch's opening takes a half width of 2.70 and a top of 2.45, while
 * staying hidden behind the card takes no more than 3.56 and 3.70. 6.2 by
 * 3.4 sits inside both, with room for the pointer's parallax.
 */
function backWall(): Painted {
  const material = new MeshStandardMaterial({ map: wallTexture(), roughness: 0.96, metalness: 0 });
  const mesh = planeMesh({ width: 6.2, height: 3.4 }, material, "centre");
  mesh.position.set(0, 1.3, STAGE.z.wall);
  mesh.castShadow = false;
  return { mesh, material };
}

/*
 * The apron: the front board of the box, from the floor's edge down past the
 * bottom of the picture. From the camera's height the floor alone does not
 * hide what waits under it (a puppet dropped to y = -1.5 showed beneath the
 * theatre), so the box gets a front like a real one has.
 */
function apron(): Mesh {
  const material = new MeshStandardMaterial({ color: 0xc9b58f, roughness: 0.95, metalness: 0 });
  const mesh = planeMesh({ width: 4.2, height: 2.6 }, material, "centre");
  mesh.position.set(0, -1.3, STAGE.z.proscenium + 0.02);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 21;
  return mesh;
}

function floor(): Painted {
  const material = new MeshStandardMaterial({ color: DAY_FLOOR.getHex(), roughness: 0.95, metalness: 0 });
  const geometry = new PlaneGeometry(4, 4);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 0, -1.3);
  mesh.receiveShadow = true;
  return { mesh, material };
}

async function proscenium(): Promise<Mesh> {
  const mesh = await cutoutMesh("proscenium", 2.6, {
    anchor: "centre",
    castShadow: false,
    receiveShadow: false,
  });
  mesh.position.set(0, 1.2, STAGE.z.proscenium);
  mesh.renderOrder = 20;
  return mesh;
}

async function footlights(): Promise<Mesh> {
  const mesh = await cutoutMesh("footlights", heightAcross("footlights", 3.2), {
    anchor: "bottom",
    castShadow: false,
    receiveShadow: false,
    emissive: 0xe8a33d,
    emissiveIntensity: 0.8,
  });
  mesh.position.set(0, 0.05, STAGE.z.footlights);
  mesh.renderOrder = 18;
  return mesh;
}

async function curtainHalf(mirrored: boolean): Promise<Group> {
  const mesh = await cutoutMesh("curtain", CURTAIN_HEIGHT, { anchor: "bottom", receiveShadow: false });
  mesh.geometry.translate(planeForHeight(PIECES.curtain, CURTAIN_HEIGHT).width / 2, 0, 0);
  if (mirrored) mesh.scale.x = -1;
  mesh.renderOrder = 19;
  const group = new Group();
  group.add(mesh);
  group.position.set(mirrored ? 1.5 : -1.5, 0.04, STAGE.z.curtain);
  return group;
}

async function backPlate(): Promise<Mesh> {
  const material = cutoutMaterial(await loadCutout(pieceSrc("back")), { alphaTest: 0 });
  material.opacity = 0;
  const mesh = planeMesh({ width: 3.2, height: 2.13 }, material, "centre");
  mesh.position.set(0, 1.15, 0.4);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 16;
  mesh.visible = false;
  return mesh;
}

/** Builds the whole box, textures and all. Resolves when it can be shown. */
export async function buildTheatre(): Promise<Theatre> {
  const wall = backWall();
  const ground = floor();
  const [arch, lamps, left, right, plate] = await Promise.all([
    proscenium(),
    footlights(),
    curtainHalf(false),
    curtainHalf(true),
    backPlate(),
  ]);
  const group = new Group();
  group.add(wall.mesh, ground.mesh, apron(), arch, lamps, left, right, plate);
  const movable = new Map<ObjectId, Object3D>([
    ["curtainLeft", left],
    ["curtainRight", right],
    ["backPlate", plate],
  ]);
  const setNight = (amount: number): void => {
    const night = clamp01(amount);
    wall.material.color.copy(DAY_WALL).lerp(NIGHT_WALL, night);
    ground.material.color.copy(DAY_FLOOR).lerp(NIGHT_FLOOR, night);
  };
  return { group, movable, setNight };
}
