import type { Frame, ObjectId, Tick } from "./contract.ts";

/*
 * The scene's shape, written down on this side of the wall. The WebGL stage
 * is built in ../webgl and loaded at runtime; the page never imports it at
 * type-check time, so the two halves can be written at once and the page
 * still runs (without a picture) if the scene is not there yet.
 */
export interface StageLike {
  readonly ready: Promise<void>;
  apply(frame: Frame, tick: Tick): void;
  resize(width: number, height: number, dpr: number): void;
  setMouth(id: ObjectId, open: boolean): void;
  /** Where the object is on screen, in CSS pixels, or null when off stage. */
  screenPosition(id: ObjectId): { x: number; y: number } | null;
  setNight(amount: number): void;
  hitTest(clientX: number, clientY: number): ObjectId | null;
  dispose(): void;
}

export interface StageClass {
  new (canvas: HTMLCanvasElement): StageLike;
}

/** What a lazily loaded ../webgl/index.ts is expected to export. */
export interface StageModule {
  readonly Stage?: StageClass;
}

/** Vite hands `import.meta.glob` back in this shape: path to lazy loader. */
export type StageModules = Record<string, () => Promise<unknown>>;
