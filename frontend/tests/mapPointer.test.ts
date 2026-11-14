/**
 * Regression tests for the pointer gesture controller (QA Bug 2).
 *
 * The QA finding: physical pointer presses on the Zoom/Reset buttons bubbled
 * to the viewport container, which captured the pointer — the button's own
 * pointerup was retargeted to the container and its click never fired. These
 * tests exercise the real event SEQUENCE semantics (down → move → up with
 * target discrimination), not synthetic click dispatch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { MapPointerController, DEFAULT_DRAG_CLICK_THRESHOLD_PX } from "../src/app/mapPointer.ts";

const p = (x: number, y: number) => ({ screen: { x, y }, pointerId: 1 });

test("a press on an interactive control never starts a map gesture", () => {
  const controller = new MapPointerController();
  // down → move → up, exactly what a physical click on a button produces,
  // with the target flagged as a control.
  controller.onPointerDown({ ...p(520, 300), targetIsControl: true });
  assert.equal(controller.dragging, false, "control presses must not start dragging");
  const moveResult = controller.onPointerMove(p(524, 296));
  assert.equal(moveResult.pan, null, "control presses must not pan");
  const upResult = controller.onPointerUp(p(524, 296));
  assert.equal(upResult.clicked, false, "control presses must not produce a map click");
});

test("a full physical click sequence on a control yields no pan and no click", () => {
  const controller = new MapPointerController();
  // Some browsers/automation move the mouse before the press; the target is
  // still the control.
  controller.onPointerMove(p(500, 280));
  controller.onPointerDown({ ...p(510, 290), targetIsControl: true });
  controller.onPointerUp(p(511, 291));
  assert.equal(controller.dragging, false);
});

test("a stationary press on the map surface completes as a click", () => {
  const controller = new MapPointerController();
  controller.onPointerDown({ ...p(400, 300), targetIsControl: false });
  assert.equal(controller.dragging, true);
  const result = controller.onPointerUp(p(400, 300));
  assert.equal(result.clicked, true);
  assert.equal(controller.dragging, false);
});

test("dragging beyond the threshold produces pan intents and no click", () => {
  const controller = new MapPointerController();
  controller.onPointerDown({ ...p(400, 300), targetIsControl: false });
  const move1 = controller.onPointerMove(p(450, 280));
  assert.deepEqual(move1.pan, { x: 50, y: -20 });
  const move2 = controller.onPointerMove(p(470, 270));
  assert.deepEqual(move2.pan, { x: 20, y: -10 });
  const up = controller.onPointerUp(p(470, 270));
  assert.equal(up.clicked, false, "a pan gesture must not be reported as a click");
  assert.equal(up.pan, null);
});

test("the drag threshold distinguishes click from pan", () => {
  const clickController = new MapPointerController();
  clickController.onPointerDown({ ...p(0, 0), targetIsControl: false });
  clickController.onPointerMove(p(2, 2)); // hypot ≈ 2.83 < 4
  assert.equal(clickController.onPointerUp(p(2, 2)).clicked, true);

  const panController = new MapPointerController();
  panController.onPointerDown({ ...p(0, 0), targetIsControl: false });
  panController.onPointerMove(p(3, 3)); // hypot ≈ 4.24 >= 4
  assert.equal(panController.onPointerUp(p(3, 3)).clicked, false);
  assert.equal(DEFAULT_DRAG_CLICK_THRESHOLD_PX, 4);
});

test("events from a different pointer id are ignored while a gesture is active", () => {
  const controller = new MapPointerController();
  controller.onPointerDown({ ...p(100, 100), pointerId: 1, targetIsControl: false });
  // A second pointer lands on a control and then moves/up: no effect.
  controller.onPointerDown({ ...p(200, 200), pointerId: 2, targetIsControl: true });
  const foreignMove = controller.onPointerMove({ screen: { x: 260, y: 260 }, pointerId: 2 });
  assert.equal(foreignMove.pan, null);
  const foreignUp = controller.onPointerUp({ screen: { x: 260, y: 260 }, pointerId: 2 });
  assert.equal(foreignUp.clicked, false);
  // The first gesture is still active and pans normally.
  assert.equal(controller.dragging, true);
  const ownMove = controller.onPointerMove({ screen: { x: 110, y: 100 }, pointerId: 1 });
  assert.deepEqual(ownMove.pan, { x: 10, y: 0 });
});

test("pointer cancel clears the gesture so no click can follow", () => {
  const controller = new MapPointerController();
  controller.onPointerDown({ ...p(100, 100), pointerId: 1, targetIsControl: false });
  controller.onPointerMove(p(140, 140));
  controller.onPointerCancel({ screen: { x: 140, y: 140 }, pointerId: 1 });
  assert.equal(controller.dragging, false);
  const result = controller.onPointerUp(p(140, 140));
  assert.equal(result.clicked, false);
});

test("pointerup without a matching down is ignored", () => {
  const controller = new MapPointerController();
  const result = controller.onPointerUp(p(500, 500));
  assert.equal(result.clicked, false);
});

test("control presses are ignored even after a map gesture has ended", () => {
  const controller = new MapPointerController();
  controller.onPointerDown({ ...p(100, 100), targetIsControl: false });
  controller.onPointerUp(p(101, 101));
  controller.onPointerDown({ ...p(520, 300), targetIsControl: true });
  assert.equal(controller.dragging, false);
});
