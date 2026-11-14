/**
 * Pure viewport transform math for the Mars map.
 *
 * Convention: a {@link ViewTransform} maps IMAGE pixel coordinates to
 * VIEWPORT (CSS) pixel coordinates with `screen = offset + image * scale`.
 * All interaction math (pan, wheel zoom at the cursor, fit, reset) is pure so
 * it can be unit-tested without a DOM, and so markers rendered from the same
 * transform can never drift out of alignment with the image.
 *
 * The transform is intentionally independent of container size once created:
 * a responsive CSS resize does not mutate it, so image coordinates and marker
 * alignment are stable across viewport resizes. Only the explicit "fit/reset"
 * action recomputes a transform from the current container size.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** screen = offset + image * scale (both in CSS pixels). */
export interface ViewTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 64;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function imageToScreen(t: ViewTransform, p: Point): Point {
  requireFinite(p.x, "image x");
  requireFinite(p.y, "image y");
  return { x: t.offsetX + p.x * t.scale, y: t.offsetY + p.y * t.scale };
}

export function screenToImage(t: ViewTransform, p: Point): Point {
  requireFinite(p.x, "screen x");
  requireFinite(p.y, "screen y");
  return { x: (p.x - t.offsetX) / t.scale, y: (p.y - t.offsetY) / t.scale };
}

/** Translate the view by viewport-space deltas (drag panning). */
export function panBy(t: ViewTransform, dx: number, dy: number): ViewTransform {
  requireFinite(dx, "pan dx");
  requireFinite(dy, "pan dy");
  return { scale: t.scale, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy };
}

export function clampScaleValue(scale: number, minScale = MIN_SCALE, maxScale = MAX_SCALE): number {
  requireFinite(scale, "scale");
  return clamp(scale, minScale, maxScale);
}

/**
 * Zoom keeping the image point under `screenPoint` stationary: the cursor
 * stays anchored on the same terrain while the scale changes. `factor` > 1
 * zooms in. The resulting scale is clamped to [minScale, maxScale].
 */
export function zoomAt(
  t: ViewTransform,
  screenPoint: Point,
  factor: number,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
): ViewTransform {
  requireFinite(factor, "zoom factor");
  if (factor <= 0) {
    throw new RangeError(`zoom factor must be > 0, got ${factor}`);
  }
  const image = screenToImage(t, screenPoint);
  const targetScale = clamp(t.scale * factor, minScale, maxScale);
  return {
    scale: targetScale,
    offsetX: screenPoint.x - image.x * targetScale,
    offsetY: screenPoint.y - image.y * targetScale,
  };
}

/**
 * Initial/reset transform: the whole image fits inside the viewport with
 `padding` pixels of breathing room, centred. Returns identity-ish values
 for degenerate (zero-sized) inputs rather than throwing, so first render
 before layout measurement is safe.
 */
export function fitTransform(
  imageSize: Size,
  viewportSize: Size,
  padding = 24,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
): ViewTransform {
  requireFinite(imageSize.width, "imageSize.width");
  requireFinite(imageSize.height, "imageSize.height");
  requireFinite(viewportSize.width, "viewportSize.width");
  requireFinite(viewportSize.height, "viewportSize.height");
  if (imageSize.width <= 0 || imageSize.height <= 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availableW = Math.max(1, viewportSize.width - padding * 2);
  const availableH = Math.max(1, viewportSize.height - padding * 2);
  const scale = clamp(Math.min(availableW / imageSize.width, availableH / imageSize.height), minScale, maxScale);
  return {
    scale,
    offsetX: (viewportSize.width - imageSize.width * scale) / 2,
    offsetY: (viewportSize.height - imageSize.height * scale) / 2,
  };
}

/**
 * Wheel-delta to zoom factor. `deltaMode` 1 (lines, Firefox) is scaled up;
 * a notch on a typical mouse yields a modest multiplicative step.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  requireFinite(deltaY, "deltaY");
  const delta = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-delta * 0.0015);
}
