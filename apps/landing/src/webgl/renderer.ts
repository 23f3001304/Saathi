/**
 * The renderer and the one camera. The camera sits where the contract says an
 * audience sits; on a narrow screen the lens widens rather than the stage
 * shrinking, so the whole 3 unit opening stays in frame on a phone.
 */
import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

import { STAGE } from "../show/contract.ts";
import { fovForAspect } from "./math.ts";

/** Where the camera rests before the pointer nudges it. */
export const CAMERA_HOME = new Vector3(...STAGE.camera.position);

/** What it keeps looking at, however far it drifts. */
export const CAMERA_TARGET = new Vector3(...STAGE.camera.target);

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x120f0b, 1);
  return renderer;
}

export function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(STAGE.camera.fov, 1.6, 0.1, 40);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(CAMERA_TARGET);
  return camera;
}

/**
 * The canvas keeps whatever CSS size the page gave it (`setSize` is told not
 * to touch the style), so nothing here can start a layout feedback loop.
 */
export function resizeView(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  dpr: number,
): void {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  renderer.setPixelRatio(Math.min(Math.max(dpr, 1), 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = fovForAspect(camera.aspect);
  camera.updateProjectionMatrix();
}
