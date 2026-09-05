/**
 * Everything the choreography can move: four rod puppets, the bazaar flats,
 * the clouds, the paper props, and the three night silhouettes. Each one is
 * built at its own size and handed back under its contract id.
 *
 * A puppet is a group: the cutout stands at the group's origin (its feet) and
 * a wooden stick runs up behind it and on down through the floor, so a lean
 * (`pose.rot`) turns the whole thing about the hand that holds it.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";

import { STAGE, type ObjectId } from "../show/contract.ts";
import type { PieceName } from "../stage/pieces.ts";
import { stampTexture, tagTexture } from "./canvas.ts";
import { cutoutMesh, heightAcross, planeMesh, type CutoutMeshOptions } from "./pieces3d.ts";
import { cutoutMaterial } from "./textures.ts";

export const PUPPET_HEIGHT = 1.25;
export const PUPPET_IDS = ["saathi", "shopper", "shopkeeper", "tout"] as const;
export type PuppetId = (typeof PUPPET_IDS)[number];

type Sized = readonly [PieceName & ObjectId, number, number];

const FLATS: readonly Sized[] = [
  ["goldArch", 1.1, STAGE.z.mid],
  ["redBuilding", 1.0, STAGE.z.far],
  ["stallTeal", 0.95, STAGE.z.near],
  ["stallIndigo", 0.95, STAGE.z.near],
];

const NIGHT_LAYERS: readonly Sized[] = [
  ["nightFar", 1.5, STAGE.z.far],
  ["nightMid", 1.6, STAGE.z.mid],
  ["nightNear", 1.7, STAGE.z.near],
];

const CLOUDS: readonly (readonly [ObjectId, PieceName, number])[] = [
  ["cloudA", "cloudA", 0.5],
  ["cloudB", "cloudB", 0.42],
  ["cloudC", "cloudA", 0.3],
];

const STAMPS = ["stamp1", "stamp2", "stamp3"] as const satisfies readonly ObjectId[];
const TAGS = ["tag1", "tag2", "tag3"] as const satisfies readonly ObjectId[];

const AIR: CutoutMeshOptions = {
  anchor: "centre",
  emissive: 0xffffff,
  emissiveIntensity: 0.35,
  castShadow: false,
  receiveShadow: false,
};

function stick(): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.012, 0.012, 1.4, 8),
    new MeshStandardMaterial({ color: 0xc9a267, roughness: 0.8, metalness: 0, transparent: true }),
  );
  mesh.position.set(0, -0.35, -0.03);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

async function puppet(id: PuppetId): Promise<Group> {
  const face = await cutoutMesh(id, PUPPET_HEIGHT, { anchor: "bottom" });
  face.name = `${id}:face`;
  const group = new Group();
  group.name = id;
  group.add(stick(), face);
  group.position.set(0, 0, STAGE.z.cast);
  return group;
}

async function addPuppets(map: Map<ObjectId, Object3D>): Promise<void> {
  const built = await Promise.all(PUPPET_IDS.map(async (id) => [id, await puppet(id)] as const));
  for (const [id, group] of built) map.set(id, group);
}

async function addStanding(
  map: Map<ObjectId, Object3D>,
  rows: readonly Sized[],
  unlit: boolean,
): Promise<void> {
  const opts: CutoutMeshOptions = {
    anchor: "bottom",
    unlit,
    castShadow: !unlit,
    receiveShadow: !unlit,
  };
  const built = await Promise.all(
    rows.map(async (row) => {
      const mesh = await cutoutMesh(row[0], row[1], opts);
      mesh.position.set(0, 0, row[2]);
      return [row[0], mesh] as const;
    }),
  );
  for (const [id, mesh] of built) map.set(id, mesh);
}

async function addClouds(map: Map<ObjectId, Object3D>): Promise<void> {
  const built = await Promise.all(
    CLOUDS.map(async (row) => [row[0], await cutoutMesh(row[1], row[2], AIR)] as const),
  );
  for (const [id, mesh] of built) {
    mesh.position.set(0, 1.7, STAGE.z.far);
    map.set(id, mesh);
  }
}

async function addProps(map: Map<ObjectId, Object3D>): Promise<void> {
  const [slip, lamp] = await Promise.all([
    cutoutMesh("slip", heightAcross("slip", 0.9), { anchor: "centre" }),
    cutoutMesh("lamp", 0.32, { anchor: "centre" }),
  ]);
  map.set("slip", slip);
  map.set("lamp", lamp);
}

/** The three drawn props: the ledger scroll, the stamps, the struck out tags. */
function addPaper(map: Map<ObjectId, Object3D>): void {
  const paper = cutoutMaterial(null, { colour: 0xfaf7f2, emissive: 0xfff3dd, emissiveIntensity: 0.25 });
  map.set("scroll", planeMesh({ width: 0.9, height: 1.3 }, paper, "centre"));
  const stamp = stampTexture();
  const tag = tagTexture();
  for (const id of STAMPS) {
    const inked = cutoutMaterial(stamp, { alphaTest: 0.1 });
    map.set(id, planeMesh({ width: 0.34, height: 0.2 }, inked, "centre"));
  }
  for (const id of TAGS) {
    const priced = cutoutMaterial(tag, { alphaTest: 0.1 });
    map.set(id, planeMesh({ width: 0.28, height: 0.4 }, priced, "centre"));
  }
}

/** Builds every movable object once. Resolves when all of them can be shown. */
export async function buildObjects(): Promise<Map<ObjectId, Object3D>> {
  const map = new Map<ObjectId, Object3D>();
  addPaper(map);
  await Promise.all([
    addPuppets(map),
    addStanding(map, FLATS, false),
    addStanding(map, NIGHT_LAYERS, true),
    addClouds(map),
    addProps(map),
  ]);
  return map;
}
