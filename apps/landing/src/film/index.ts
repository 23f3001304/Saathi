/**
 * The film, standing in for the stage. Same contract, no geometry:
 *
 *   const stage = new Stage(canvas);
 *   await stage.ready;          // rejects when there is no film to play
 *   stage.apply(frame, tick);   // once per animation frame, from the runtime
 *
 * The frame the choreography works out is ignored here; the picture is
 * already in the film and the only thing the scroll decides is where in it
 * the reader is standing. There is no loop and no listener in here either.
 */
import type { Frame, ObjectId, Tick } from "../show/contract.ts";
import type { StageLike } from "../show/stage.ts";
import {
  anchorAt,
  coverRect,
  inToutBox,
  isAnchorId,
  type Point,
  type Rect,
} from "./anchors.ts";
import {
  createFilm,
  filmReady,
  hasPicture,
  removeFilm,
  seekWanted,
  targetTime,
} from "./film.ts";

const MAX_DPR = 2;

export class Stage implements StageLike {
  /** Resolves when the film has arrived, rejects when there is none. */
  readonly ready: Promise<void>;

  private readonly canvas: HTMLCanvasElement;
  private readonly video: HTMLVideoElement;
  private context: CanvasRenderingContext2D | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private wanted = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.video = createFilm();
    this.ready = filmReady(this.video);
  }

  /** One frame: send the film to where the reader is, then draw it. */
  apply(_frame: Frame, tick: Tick): void {
    const ctx = this.paper();
    if (ctx === null) return;
    this.seek(tick.progress);
    // A seek in flight has no picture yet; the last drawn frame stays up
    // rather than a flash of the page behind the canvas.
    if (!hasPicture(this.video)) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const rect = this.rect();
    ctx.drawImage(this.video, rect.x, rect.y, rect.width, rect.height);
  }

  /* The 2D context is taken on the first frame, never in the constructor: a
     canvas keeps the first kind of context it is given for life, and this
     canvas goes to the built stage when the film does not turn up. */
  private paper(): CanvasRenderingContext2D | null {
    if (this.context === null) this.context = this.canvas.getContext("2d");
    return this.context;
  }

  /* One seek per frame at most, because `apply` is the frame, and only when
     the picture would move: a seek still in flight simply shows the frame
     the element is already holding. */
  private seek(progress: number): void {
    const want = targetTime(progress, this.video.duration);
    if (!seekWanted(want, this.wanted)) return;
    this.wanted = want;
    this.video.currentTime = want;
  }

  private rect(): Rect {
    return coverRect(
      { width: this.width, height: this.height },
      { width: this.video.videoWidth, height: this.video.videoHeight },
    );
  }

  /** CSS pixels in, backing pixels out, at no more than two per pixel. */
  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.dpr = Math.min(Math.max(dpr, 1), MAX_DPR);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  setMouth(): void {
    /* The film has its own mouths. */
  }

  setNight(): void {
    /* The film has its own night. */
  }

  /** Where a puppet stands on the canvas, for the card that hangs above it. */
  screenPosition(id: ObjectId): Point | null {
    return isAnchorId(id) ? anchorAt(this.rect(), id) : null;
  }

  /** The tout, and nothing else, answers a click. */
  hitTest(clientX: number, clientY: number): ObjectId | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    const point = { x: clientX - box.left, y: clientY - box.top };
    return inToutBox(this.rect(), point) ? "tout" : null;
  }

  dispose(): void {
    removeFilm(this.video);
    this.context = null;
  }
}
