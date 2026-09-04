import { decodePng } from "../src/frame/png.js";

/** The two full-bleed fixtures, by the corner colour each one floods. */
const CORNER = 50;
export type Shade = "A" | "B" | "other";

export function shadeOf(bytes: Uint8Array): Shade {
  const image = decodePng(bytes);
  const wide = Math.min(CORNER, image.width);
  const tall = Math.min(CORNER, image.height);
  let red = 0;
  let blue = 0;
  for (let y = 0; y < tall; y += 1) {
    for (let x = 0; x < wide; x += 1) {
      const at = (y * image.width + x) * 4;
      red += image.pixels[at] ?? 0;
      blue += image.pixels[at + 2] ?? 0;
    }
  }
  const count = wide * tall;
  return nearest(red / count, blue / count);
}

/** `other` is a real answer, not a failure: a document that has committed but
 *  not painted is neither page, and the assertions below are about A and B. */
function nearest(red: number, blue: number): Shade {
  if (red > 120 && blue < 90) return "A";
  if (blue > 120 && red < 90) return "B";
  return "other";
}
