import type { RasterImage } from "./png.js";
import { decodePng, encodePng } from "./png.js";

/**
 * The page, with its coordinate system made visible: grid lines every 100
 * pixels and the axis numbers drawn along both edges, burned into the same
 * redacted screenshot the shopper's own card shows. This is what the errand
 * model is handed when it asks to LOOK - so "press at 640,520" is something
 * it can read off the picture rather than guess from a control list. The
 * input is always the redacted capture; nothing here sees a raw pixel the
 * card would not.
 */

const GRID_STEP = 100;
const LINE_ALPHA = 90;
const GRID_R = 255;
const GRID_G = 120;
const GRID_B = 0;

/** 3x5 digit glyphs, row-major bits. Enough font for axis labels. */
const DIGITS: readonly number[][] = [
  [7, 5, 5, 5, 7], // 0
  [2, 6, 2, 2, 7], // 1
  [7, 1, 7, 4, 7], // 2
  [7, 1, 7, 1, 7], // 3
  [5, 5, 7, 1, 1], // 4
  [7, 4, 7, 1, 7], // 5
  [7, 4, 7, 5, 7], // 6
  [7, 1, 2, 2, 2], // 7
  [7, 5, 7, 5, 7], // 8
  [7, 5, 7, 1, 7], // 9
];
const GLYPH_SCALE = 2;

function blend(image: RasterImage, x: number, y: number, alpha: number): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const at = (y * image.width + x) * 4;
  const held = image.pixels;
  const keep = 255 - alpha;
  held[at] = ((held[at] ?? 0) * keep + GRID_R * alpha) / 255;
  held[at + 1] = ((held[at + 1] ?? 0) * keep + GRID_G * alpha) / 255;
  held[at + 2] = ((held[at + 2] ?? 0) * keep + GRID_B * alpha) / 255;
}

function solid(image: RasterImage, x: number, y: number): void {
  blend(image, x, y, 255);
}

function drawDigit(image: RasterImage, digit: number, x: number, y: number): void {
  const rows = DIGITS[digit] ?? DIGITS[0];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if ((((rows as number[])[row] ?? 0) >> (2 - col)) & 1) {
        for (let sy = 0; sy < GLYPH_SCALE; sy += 1) {
          for (let sx = 0; sx < GLYPH_SCALE; sx += 1) {
            solid(image, x + col * GLYPH_SCALE + sx, y + row * GLYPH_SCALE + sy);
          }
        }
      }
    }
  }
}

function drawNumber(image: RasterImage, value: number, x: number, y: number): void {
  const text = String(value);
  for (let at = 0; at < text.length; at += 1) {
    drawDigit(image, Number(text[at]), x + at * (3 * GLYPH_SCALE + 2), y);
  }
}

function drawGrid(image: RasterImage): void {
  for (let x = GRID_STEP; x < image.width; x += GRID_STEP) {
    for (let y = 0; y < image.height; y += 1) blend(image, x, y, LINE_ALPHA);
    drawNumber(image, x, x + 3, 2);
  }
  for (let y = GRID_STEP; y < image.height; y += GRID_STEP) {
    for (let x = 0; x < image.width; x += 1) blend(image, x, y, LINE_ALPHA);
    drawNumber(image, y, 3, y + 3);
  }
}

/** Redacted PNG in, the same PNG with the grid burned in out. */
export function withCoordinateGrid(png: Uint8Array): Uint8Array {
  const image = decodePng(png);
  drawGrid(image);
  return encodePng(image);
}
