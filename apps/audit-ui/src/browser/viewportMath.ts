// Viewport pixels to page pixels.
//
// The frame is drawn at whatever width the card has, which is almost never the
// sandbox window's real width. So a click has to travel as a *ratio*: 40%
// across the picture is 40% across the real window. Getting this wrong is not
// a cosmetic bug — it would land the pointer on a different element than the
// one the user aimed at, and the host would then judge that other element.

export interface RenderedBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

export function pagePoint(
  box: RenderedBox,
  clientX: number,
  clientY: number,
  frameWidth: number,
  frameHeight: number,
): PagePoint {
  const scaleX = frameWidth > 0 && box.width > 0 ? frameWidth / box.width : 1;
  const scaleY =
    frameHeight > 0 && box.height > 0 ? frameHeight / box.height : 1;
  return {
    x: Math.round((clientX - box.left) * scaleX),
    y: Math.round((clientY - box.top) * scaleY),
  };
}
