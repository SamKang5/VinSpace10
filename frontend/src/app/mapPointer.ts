/**
 * Pointer gesture controller for the map viewport (M1-03).
 *
 * Owns the drag/click discrimination state machine so it can be unit-tested
 * without a DOM. The React component feeds it real pointer events and applies
 * the returned intents.
 *
 * Critical rule (QA Bug 2 fix): a pointer press whose target is an
 * interactive control (zoom/reset buttons, any [data-map-control] element)
 * NEVER starts a map gesture. Previously the viewport container captured
 * every bubbled pointerdown, which retargeted the button's own pointerup to
 * the container — physical clicks on "Zoom in"/"Reset view" never completed,
 * while synthetic `click` dispatches (which bypass pointer capture) worked.
 */

import type { Point } from "./mapTransform.ts";

export interface PointerSample {
  readonly screen: Point;
  readonly pointerId: number;
}

export interface PointerDownInput extends PointerSample {
  /** True when the press landed on an interactive control inside the viewport. */
  readonly targetIsControl: boolean;
}

export interface PointerGestureResult {
  /** Viewport-space pan delta to apply, or null. */
  readonly pan: Point | null;
  /** True when this pointerup completes a stationary press on the map surface. */
  readonly clicked: boolean;
}

export const DEFAULT_DRAG_CLICK_THRESHOLD_PX = 4;

export class MapPointerController {
  #drag: { readonly pointerId: number; readonly lastScreen: Point; readonly moved: number } | null = null;
  readonly dragThresholdPx: number;

  constructor(dragThresholdPx: number = DEFAULT_DRAG_CLICK_THRESHOLD_PX) {
    this.dragThresholdPx = dragThresholdPx;
  }

  get dragging(): boolean {
    return this.#drag !== null;
  }

  onPointerDown(input: PointerDownInput): void {
    // Interactive controls must never initiate panning or selection: the
    // viewport must not capture their pointer, or their click never fires.
    if (input.targetIsControl) {
      return;
    }
    if (this.#drag !== null) {
      return; // a gesture is already in progress with another pointer
    }
    this.#drag = { pointerId: input.pointerId, lastScreen: input.screen, moved: 0 };
  }

  onPointerMove(sample: PointerSample): PointerGestureResult {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== sample.pointerId) {
      return { pan: null, clicked: false };
    }
    const dx = sample.screen.x - drag.lastScreen.x;
    const dy = sample.screen.y - drag.lastScreen.y;
    this.#drag = { ...drag, lastScreen: sample.screen, moved: drag.moved + Math.hypot(dx, dy) };
    return { pan: { x: dx, y: dy }, clicked: false };
  }

  onPointerUp(sample: PointerSample): PointerGestureResult {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== sample.pointerId) {
      return { pan: null, clicked: false };
    }
    this.#drag = null;
    const moved = drag.moved + Math.hypot(sample.screen.x - drag.lastScreen.x, sample.screen.y - drag.lastScreen.y);
    // A stationary press (< threshold) is a map-surface click; anything else
    // was a pan.
    return { pan: null, clicked: moved < this.dragThresholdPx };
  }

  onPointerCancel(sample?: PointerSample): void {
    if (this.#drag === null) {
      return;
    }
    if (sample !== undefined && this.#drag.pointerId !== sample.pointerId) {
      return;
    }
    this.#drag = null;
  }
}
