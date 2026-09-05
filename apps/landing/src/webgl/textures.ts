/**
 * Cutout textures and the paper material every piece is cut from.
 *
 * The cutouts are alpha keyed WebP. Mipmaps stay on (with anisotropy, so a
 * flat seen at an angle keeps its edge) and the wrap is clamped, which is what
 * stops the mip chain smearing a transparent column back into the artwork.
 * The alpha test then cuts the silhouette, and three's shadow pass copies
 * `map` and `alphaTest` onto its own depth material, so a puppet throws a
 * puppet shaped shadow without a custom depth material.
 */
import {
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type ColorRepresentation,
  type Texture,
} from "three";

export const ALPHA_TEST = 0.5;

export interface CutoutOptions {
  readonly colour?: ColorRepresentation;
  readonly emissive?: ColorRepresentation;
  readonly emissiveIntensity?: number;
  readonly alphaTest?: number;
}

const cache = new Map<string, Promise<Texture>>();
let loader: TextureLoader | null = null;

function dress(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Loads a cutout once; later asks for the same URL get the same texture. */
export function loadCutout(url: string): Promise<Texture> {
  const held = cache.get(url);
  if (held !== undefined) return held;
  loader ??= new TextureLoader();
  const source = loader;
  const pending = new Promise<Texture>((resolve, reject) => {
    source.load(
      url,
      (texture) => { resolve(dress(texture)); },
      undefined,
      () => { cache.delete(url); reject(new Error(`stage cutout missing: ${url}`)); },
    );
  });
  cache.set(url, pending);
  return pending;
}

/** Paper: rough, unmetallic, two sided, and lit by the rig like everything else. */
export function cutoutMaterial(
  texture: Texture | null,
  opts: CutoutOptions = {},
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: texture,
    color: opts.colour ?? 0xffffff,
    transparent: true,
    alphaTest: opts.alphaTest ?? ALPHA_TEST,
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
    depthWrite: true,
  });
  if (opts.emissive === undefined) return material;
  material.emissive.set(opts.emissive);
  material.emissiveIntensity = opts.emissiveIntensity ?? 1;
  material.emissiveMap = texture;
  return material;
}

/** A silhouette that ignores the rig: the night skyline, the glow behind it. */
export function flatMaterial(
  texture: Texture | null,
  colour: ColorRepresentation = 0xffffff,
): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: texture,
    color: colour,
    transparent: true,
    alphaTest: ALPHA_TEST,
    side: DoubleSide,
    depthWrite: true,
  });
}

/** Drops every cached cutout. Only the stage's own dispose should call this. */
export function disposeCutouts(): void {
  for (const pending of cache.values()) {
    void pending.then((texture) => { texture.dispose(); }).catch(() => undefined);
  }
  cache.clear();
}
