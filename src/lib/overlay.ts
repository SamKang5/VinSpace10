// Terrain overlay layers (M2-06 / M4-04).
//
// Two layers are rendered from the D07 rasters the app now loads:
//
//   - Slope classes: the authoritative hazard raster, class 0 below 5 degrees,
//     1 from 5 to 10, 2 from 10 to 15, and 3 at 15 or above, which is also
//     the blocked set the router excludes.
//   - Elevation: the D07 elevation raster, tinted on a low-to-high ramp
//     scaled to the raster's own range.
//
// The classes are an illustrative research threshold, not a safety rating.

/** Hazard class per cell: 0 below 5 deg, 1 up to 10, 2 up to 15, 3 blocked. */
export type SlopeClass = 0 | 1 | 2 | 3;

/** RGBA per class. Class 0 is transparent so flat ground shows the imagery. */
const CLASS_COLOR: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0],
  [230, 195, 90, 65],
  [242, 132, 59, 105],
  [242, 68, 45, 150],
];

export const SLOPE_SWATCHES = CLASS_COLOR.map(([r, g, b, a]) => `rgb(${r} ${g} ${b} / ${a / 255})`);

/** The slope in degrees that puts a cell in each class. */
export const SLOPE_CLASS_EDGES = [5, 10, 15] as const;

/** Human-readable label per class, for the legend. */
export const SLOPE_CLASS_LABELS: Record<SlopeClass, string> = {
  0: '<5°',
  1: '5° to <10°',
  2: '10° to <15°',
  3: '≥15°',
};

export function slopeClassOf(slopeDeg: number): SlopeClass {
  if (!Number.isFinite(slopeDeg) || slopeDeg >= SLOPE_CLASS_EDGES[2]) return 3;
  if (slopeDeg >= SLOPE_CLASS_EDGES[1]) return 2;
  if (slopeDeg >= SLOPE_CLASS_EDGES[0]) return 1;
  return 0;
}

/**
 * Render the slope classes to an offscreen canvas the size of the grid.
 *
 * The map draws this scaled over the imagery, so the canvas is one pixel per
 * cell and the browser does the scaling.
 */
export function buildSlopeOverlay(
  width: number,
  height: number,
  hazard: Uint8Array,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const cls = hazard[i];
    const [r, g, b, a] = CLASS_COLOR[cls <= 3 ? cls : 3];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Low-to-high elevation ramp: deep basin blue to bright ridge tan. */
const ELEVATION_RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [38, 62, 126],
  [64, 108, 154],
  [118, 152, 156],
  [186, 178, 138],
  [226, 208, 168],
];

/**
 * Render the elevation raster to an offscreen canvas the size of the grid.
 *
 * The ramp is scaled to the raster's own minimum and maximum, so the legend
 * can quote the same two numbers.
 */
export function buildElevationOverlay(
  width: number,
  height: number,
  elevation: Float32Array,
  min: number,
  max: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const span = max - min || 1;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const value = elevation[i];
    const t = Number.isFinite(value) ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
    const scaled = t * (ELEVATION_RAMP.length - 1);
    const low = Math.floor(scaled);
    const high = Math.min(ELEVATION_RAMP.length - 1, low + 1);
    const mix = scaled - low;
    for (let c = 0; c < 3; c += 1) {
      image.data[i * 4 + c] = Math.round(
        ELEVATION_RAMP[low][c] + (ELEVATION_RAMP[high][c] - ELEVATION_RAMP[low][c]) * mix,
      );
    }
    image.data[i * 4 + 3] = 120;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The CSS gradient for the elevation legend swatch. */
export function elevationGradientCss(): string {
  const stops = ELEVATION_RAMP.map((c, i) => {
    const pct = (i / (ELEVATION_RAMP.length - 1)) * 100;
    return `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${pct.toFixed(0)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
