/**
 * Two rigs on one dimmer. By day a warm key throws real cutout shadows across
 * the kraft floor, a cool fill keeps the left side from going muddy, and a low
 * spot stands in for the footlights. By night all of that falls to a twelfth
 * and a single lamp behind the far skyline takes over, so the city reads as a
 * silhouette against its own glow.
 */
import {
  AdditiveBlending,
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SpotLight,
} from "three";

import { STAGE } from "../show/contract.ts";
import { glowTexture } from "./canvas.ts";
import { nightMix } from "./math.ts";
import { planeMesh } from "./pieces3d.ts";

const DAY = { ambient: 0.55, key: 1.6, fill: 0.5, spot: 0.9 };
const NIGHT_LAMP = 3;

export interface Rig {
  readonly group: Group;
  setNight(amount: number): void;
}

function keyLight(): DirectionalLight {
  const key = new DirectionalLight(0xffe3b0, DAY.key);
  key.position.set(2.2, 4.5, 3.5);
  key.target.position.set(0, 0.9, -1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  const frame = key.shadow.camera;
  frame.left = -3.4;
  frame.right = 3.4;
  frame.top = 3.4;
  frame.bottom = -1.4;
  frame.near = 0.5;
  frame.far = 16;
  frame.updateProjectionMatrix();
  return key;
}

function footlightSpot(): SpotLight {
  const spot = new SpotLight(0xffb15a, DAY.spot, 6, 0.9, 0.8, 1);
  spot.position.set(0, 0.15, 0.9);
  spot.target.position.set(0, 1, -0.8);
  return spot;
}

function glow(): { mesh: Mesh; material: MeshBasicMaterial } {
  const material = new MeshBasicMaterial({
    map: glowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = planeMesh({ width: 3.4, height: 2.3 }, material, "centre");
  mesh.position.set(0, 1.1, STAGE.z.wall + 0.06);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.visible = false;
  return { mesh, material };
}

/** Both rigs, wired to one crossfade. Day at 0, night at 1. */
export function buildLights(): Rig {
  const ambient = new AmbientLight(0xfff2dc, DAY.ambient);
  const key = keyLight();
  const fill = new DirectionalLight(0xdfe8ff, DAY.fill);
  fill.position.set(-3.2, 2.4, 2);
  const spot = footlightSpot();
  const lamp = new PointLight(0xffb35c, 0, 9, 1.6);
  lamp.position.set(0, 0.9, -2.8);
  const halo = glow();
  const group = new Group();
  group.add(ambient, key, key.target, fill, spot, spot.target, lamp, halo.mesh);
  const setNight = (amount: number): void => {
    const mix = nightMix(amount);
    ambient.intensity = DAY.ambient * mix.day;
    key.intensity = DAY.key * mix.day;
    fill.intensity = DAY.fill * mix.day;
    spot.intensity = DAY.spot * mix.day;
    lamp.intensity = NIGHT_LAMP * mix.night;
    halo.material.opacity = mix.night;
    halo.mesh.visible = mix.night > 0.002;
  };
  return { group, setNight };
}
