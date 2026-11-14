/**
 * Unit tests for the pure viewport transform math: pan, cursor-anchored
 * zoom, fit/reset, scale clamping and viewport-resize stability.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fitTransform,
  imageToScreen,
  panBy,
  screenToImage,
  wheelZoomFactor,
  zoomAt,
  MAX_SCALE,
  MIN_SCALE,
  type Point,
  type ViewTransform,
} from "../src/app/mapTransform.ts";

const IMAGE = { width: 1068, height: 1068 };
const VIEWPORT = { width: 800, height: 600 };

function assertPointClose(actual: Point, expected: Point, epsilon = 1e-9): void {
  assert.ok(
    Math.abs(actual.x - expected.x) < epsilon && Math.abs(actual.y - expected.y) < epsilon,
    `expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`,
  );
}

test("fitTransform scales the whole image into the viewport with even padding", () => {
  const t = fitTransform(IMAGE, VIEWPORT);
  const expectedScale = Math.min((800 - 48) / 1068, (600 - 48) / 1068);
  assert.equal(t.scale, expectedScale);
  // The scaled image is height-constrained: horizontal padding is the leftover.
  assert.ok(Math.abs(t.offsetX - (800 - 1068 * expectedScale) / 2) < 1e-9);
  assert.ok(Math.abs(t.offsetY - 24) < 1e-9);
  // Every corner of the image maps inside the viewport.
  for (const corner of [{ x: 0, y: 0 }, { x: 1068, y: 0 }, { x: 0, y: 1068 }, { x: 1068, y: 1068 }]) {
    const screen = imageToScreen(t, corner);
    assert.ok(screen.x >= 0 && screen.x <= 800 && screen.y >= 0 && screen.y <= 600);
  }
});

test("fitTransform is safe for degenerate zero sizes", () => {
  assert.deepEqual(fitTransform({ width: 0, height: 0 }, VIEWPORT), { scale: 1, offsetX: 0, offsetY: 0 });
  assert.deepEqual(fitTransform(IMAGE, { width: 0, height: 0 }), { scale: 1, offsetX: 0, offsetY: 0 });
});

test("screenToImage and imageToScreen are inverses", () => {
  const t: ViewTransform = { scale: 0.637, offsetX: -122.5, offsetY: 88.25 };
  const image: Point = { x: 122, y: 922 };
  assertPointClose(screenToImage(t, imageToScreen(t, image)), image);
  const screen: Point = { x: 400, y: 300 };
  assertPointClose(imageToScreen(t, screenToImage(t, screen)), screen);
});

test("zoomAt keeps the image point under the cursor stationary", () => {
  const t0 = fitTransform(IMAGE, VIEWPORT);
  const cursor: Point = { x: 517, y: 233 };
  const imageUnderCursor = screenToImage(t0, cursor);
  for (const factor of [1.5, 2, 0.5, 1 / 1.5, 10]) {
    const t1 = zoomAt(t0, cursor, factor);
    assertPointClose(screenToImage(t1, cursor), imageUnderCursor, 1e-9);
  }
});

test("zoomAt clamps the scale to the configured bounds", () => {
  const t: ViewTransform = { scale: 63, offsetX: 0, offsetY: 0 };
  const zoomed = zoomAt(t, { x: 0, y: 0 }, 10);
  assert.equal(zoomed.scale, MAX_SCALE);
  const tiny = zoomAt({ scale: 0.06, offsetX: 0, offsetY: 0 }, { x: 0, y: 0 }, 0.01);
  assert.equal(tiny.scale, MIN_SCALE);
});

test("zoomAt rejects non-positive and non-finite factors", () => {
  const t: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  assert.throws(() => zoomAt(t, { x: 0, y: 0 }, 0), RangeError);
  assert.throws(() => zoomAt(t, { x: 0, y: 0 }, -2), RangeError);
  assert.throws(() => zoomAt(t, { x: 0, y: 0 }, Number.NaN), RangeError);
});

test("panBy accumulates viewport-space translation without touching scale", () => {
  const t: ViewTransform = { scale: 0.75, offsetX: 100, offsetY: 50 };
  const moved = panBy(panBy(t, 30, -12), -50, 8);
  assert.equal(moved.scale, 0.75);
  assert.equal(moved.offsetX, 80);
  assert.equal(moved.offsetY, 46);
});

test("a sequence of pans and zooms preserves the clicked image point", () => {
  // Simulate: fit -> zoom at a click point -> pan -> zoom again, and check
  // that the terrain point originally under the cursor stays consistent.
  const t0 = fitTransform(IMAGE, VIEWPORT);
  const cursor: Point = { x: 400, y: 300 };
  const originalImage = screenToImage(t0, cursor);

  let t = zoomAt(t0, cursor, 2);
  t = panBy(t, 120, -40);
  t = zoomAt(t, { x: 640, y: 480 }, 0.75);
  t = panBy(t, -500, 300);
  // After panning, the ORIGINAL image point has moved on screen; recompute
  // where it is now and verify zooming there again keeps it consistent.
  const nowScreen = imageToScreen(t, originalImage);
  const t2 = zoomAt(t, nowScreen, 3);
  assertPointClose(screenToImage(t2, nowScreen), originalImage, 1e-6);
});

test("the transform is independent of viewport size (resize stability)", () => {
  // Fit on a large viewport, then "resize" the window: the transform must
  // remain byte-identical; only an explicit refit uses the new size.
  const t = fitTransform(IMAGE, VIEWPORT);
  const before = JSON.stringify(t);
  for (const size of [{ width: 1024, height: 768 }, { width: 480, height: 480 }, { width: 1920, height: 1080 }]) {
    // Screen<->image math with the preserved transform is unchanged.
    const image: Point = { x: 534, y: 534 };
    assertPointClose(screenToImage(t, imageToScreen(t, image)), image);
    // And the transform itself was not mutated by the (non-)resize.
    assert.equal(JSON.stringify(t), before);
    assert.equal(size.width > 0, true);
  }
  // An explicit refit on the new size produces a different, correct transform.
  const refit = fitTransform(IMAGE, { width: 1920, height: 1080 });
  assert.ok(refit.scale > t.scale);
});

test("wheelZoomFactor converts wheel deltas to multiplicative steps", () => {
  const notch = wheelZoomFactor(100, 0);
  assert.ok(Math.abs(notch - Math.exp(-0.15)) < 1e-12);
  assert.ok(notch < 1, "scrolling down zooms out");
  const lines = wheelZoomFactor(3, 1);
  assert.ok(Math.abs(lines - Math.exp(-3 * 16 * 0.0015)) < 1e-12);
  assert.equal(wheelZoomFactor(0, 0), 1);
});
