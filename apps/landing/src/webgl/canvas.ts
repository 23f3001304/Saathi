/**
 * The four textures the show draws for itself, because no cutout exists for
 * them: the paper sky behind the stage, the glow behind the night city, the
 * REFUSED stamp and the struck out price tag. All computed, none freehand.
 */
import { CanvasTexture, SRGBColorSpace } from "three";

const RED = "#b3261e";

function surface(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("stage needs a 2d canvas context");
  return context;
}

function finish(context: CanvasRenderingContext2D): CanvasTexture {
  const texture = new CanvasTexture(context.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Pale paper sky at the top, kraft at the bottom: the back wall. */
export function wallTexture(): CanvasTexture {
  const context = surface(8, 512);
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#dbe6ea");
  gradient.addColorStop(0.55, "#e6e0d2");
  gradient.addColorStop(1, "#e8dcc3");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, 512);
  return finish(context);
}

/** Saffron burning through indigo: the lamp light behind the night skyline. */
export function glowTexture(): CanvasTexture {
  const context = surface(512, 512);
  const gradient = context.createRadialGradient(256, 300, 8, 256, 300, 250);
  gradient.addColorStop(0, "rgba(255, 197, 112, 0.95)");
  gradient.addColorStop(0.35, "rgba(232, 140, 60, 0.55)");
  gradient.addColorStop(0.72, "rgba(74, 48, 118, 0.24)");
  gradient.addColorStop(1, "rgba(29, 21, 64, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return finish(context);
}

/** REFUSED, in red, inside a thin red box, and nothing else. */
export function stampTexture(word = "REFUSED"): CanvasTexture {
  const context = surface(340, 200);
  context.strokeStyle = RED;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, 337, 197);
  context.strokeRect(11.5, 11.5, 317, 177);
  context.fillStyle = RED;
  context.font = "bold 54px ui-monospace, 'IBM Plex Mono', monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(word.toUpperCase(), 170, 104, 296);
  return finish(context);
}

function tagBody(context: CanvasRenderingContext2D): void {
  context.fillStyle = "#f3ead8";
  context.strokeStyle = RED;
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(6, 6, 268, 388, 14);
  context.fill();
  context.stroke();
}

/** A cream price tag with a punched hole and its price struck through. */
export function tagTexture(): CanvasTexture {
  const context = surface(280, 400);
  tagBody(context);
  context.fillStyle = RED;
  context.fillRect(52, 168, 176, 12);
  context.fillRect(52, 226, 176, 12);
  context.lineWidth = 9;
  context.strokeStyle = RED;
  context.beginPath();
  context.moveTo(48, 262);
  context.lineTo(232, 132);
  context.stroke();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(140, 62, 22, 0, Math.PI * 2);
  context.fill();
  return finish(context);
}
