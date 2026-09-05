/**
 * The stage. The scroll runtime owns the clock; this owns the picture.
 *
 *   const stage = new Stage(canvas);
 *   await stage.ready;
 *   stage.apply(frame, tick);   // once per animation frame, from the runtime
 *
 * There is no loop, no observer and no listener in here: every frame arrives
 * from outside, which is what keeps the page to one requestAnimationFrame.
 */
import {
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";

import type { Frame, ObjectId, Tick } from "../show/contract.ts";
import { buildLights, type Rig } from "./lights.ts";
import { clamp01, easeToward, headHeight, ndcToCss, parallaxOffset } from "./math.ts";
import { collectFaces, isPuppet, setMouthOn, type Faces } from "./mouths.ts";
import { buildObjects, PUPPET_HEIGHT, type PuppetId } from "./objects.ts";
import { disposeTree } from "./pieces3d.ts";
import { applyFrame } from "./pose.ts";
import {
  CAMERA_HOME,
  CAMERA_TARGET,
  createCamera,
  createRenderer,
  resizeView,
} from "./renderer.ts";
import { disposeCutouts } from "./textures.ts";
import { buildTheatre, type Theatre } from "./theatre.ts";

export class Stage {
  /** Resolves when every texture is in and the show can be drawn. */
  readonly ready: Promise<void>;

  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly scene = new Scene();
  private readonly rig: Rig = buildLights();
  private readonly objects = new Map<ObjectId, Object3D>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly scratch = new Vector3();
  private faces: Faces = new Map();
  private theatre: Theatre | null = null;
  private width = 1;
  private height = 1;
  private night = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = createRenderer(canvas);
    this.camera = createCamera();
    this.scene.add(this.rig.group);
    this.ready = this.build();
  }

  private async build(): Promise<void> {
    const [theatre, objects] = await Promise.all([buildTheatre(), buildObjects()]);
    this.theatre = theatre;
    this.scene.add(theatre.group);
    for (const [id, object] of [...theatre.movable, ...objects]) {
      this.objects.set(id, object);
      if (object.parent === null) this.scene.add(object);
    }
    this.faces = collectFaces(this.objects);
    this.setNight(this.night);
  }

  /** One frame: every object to its pose, the camera to the pointer, draw. */
  apply(frame: Frame, tick: Tick): void {
    applyFrame(this.objects, frame);
    const night = frame.night;
    if (night !== undefined) this.setNight(night.opacity);
    this.drift(tick);
    this.renderer.render(this.scene, this.camera);
  }

  private drift(tick: Tick): void {
    const offset = parallaxOffset(tick.pointerX, tick.pointerY);
    const seat = this.camera.position;
    seat.x = easeToward(seat.x, CAMERA_HOME.x + offset.x, tick.dtMs);
    seat.y = easeToward(seat.y, CAMERA_HOME.y + offset.y, tick.dtMs);
    seat.z = CAMERA_HOME.z;
    this.camera.lookAt(CAMERA_TARGET);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    resizeView(this.renderer, this.camera, this.width, this.height, dpr);
  }

  /** 0 is the day rig, 1 is the backlit night one. */
  setNight(amount: number): void {
    this.night = clamp01(amount);
    this.rig.setNight(this.night);
    this.theatre?.setNight(this.night);
  }

  setMouth(id: PuppetId, open: boolean): void {
    setMouthOn(this.faces, id, open);
  }

  /** Where an overlay should sit: a puppet's head, or anything else's origin. */
  screenPosition(id: ObjectId): { x: number; y: number } | null {
    const object = this.objects.get(id);
    if (object === undefined || !object.visible) return null;
    object.updateWorldMatrix(true, false);
    const lift = isPuppet(id) ? headHeight(PUPPET_HEIGHT) : 0;
    const point = this.scratch.set(0, lift, 0).applyMatrix4(object.matrixWorld);
    point.project(this.camera);
    if (point.z > 1) return null;
    return ndcToCss(point.x, point.y, this.width, this.height);
  }

  private shownPuppets(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const face of this.faces.values()) {
      if (face.group.visible) meshes.push(face.mesh);
    }
    return meshes;
  }

  /** Which puppet is under the pointer, for the click that answers the tout. */
  hitTest(clientX: number, clientY: number): ObjectId | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    this.pointer.x = ((clientX - box.left) / box.width) * 2 - 1;
    this.pointer.y = 1 - ((clientY - box.top) / box.height) * 2;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const nearest = this.raycaster.intersectObjects(this.shownPuppets(), false)[0];
    if (nearest === undefined) return null;
    for (const [id, face] of this.faces) {
      if (face.mesh === nearest.object) return id;
    }
    return null;
  }

  dispose(): void {
    disposeTree(this.scene);
    this.scene.clear();
    this.objects.clear();
    this.faces.clear();
    this.theatre = null;
    disposeCutouts();
    this.renderer.dispose();
  }
}
