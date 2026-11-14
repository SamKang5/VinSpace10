/**
 * Route contract tests (M1-04): typed endpoint validation for M5's A*
 * router, fail-closed status derivation, and the honest awaiting-router
 * placeholder. No routing is implemented and no path is ever fabricated.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRouteRequest,
  getRoutePlanner,
  routeStatusForSelections,
  setRoutePlanner,
  toCellRef,
  type RoutePlanner,
  type RouteRequest,
  type RouteResult,
} from "../src/route/contract.ts";
import { loadRealFixtures } from "./helpers.ts";

const { model } = loadRealFixtures();

const START_REF = { row: 230, col: 30, index: 230 * 267 + 30 }; // contract Start (A)
const GOAL_REF = { row: 35, col: 235, index: 35 * 267 + 235 }; // contract Goal (B)
const BLOCKED_REF = { row: 0, col: 0, index: 0 }; // known blocked NW corner cell

test("createRouteRequest accepts the contract endpoint pair", () => {
  const result = createRouteRequest(model, START_REF, GOAL_REF);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.request.grid, { width: 267, height: 267 });
    assert.deepEqual(result.request.start, START_REF);
    assert.deepEqual(result.request.goal, GOAL_REF);
  }
});

test("createRouteRequest is fail-closed for blocked and out-of-bounds endpoints", () => {
  const blockedStart = createRouteRequest(model, BLOCKED_REF, GOAL_REF);
  assert.equal(blockedStart.ok, false);
  if (!blockedStart.ok) {
    assert.match(blockedStart.reason, /Start .* blocked/);
  }

  const blockedGoal = createRouteRequest(model, START_REF, BLOCKED_REF);
  assert.equal(blockedGoal.ok, false);
  if (!blockedGoal.ok) {
    assert.match(blockedGoal.reason, /Goal .* blocked/);
  }

  const outsideStart = createRouteRequest(model, { row: 267, col: 0, index: 71_289 }, GOAL_REF);
  assert.equal(outsideStart.ok, false);
  if (!outsideStart.ok) {
    assert.match(outsideStart.reason, /outside the grid/);
  }

  const outsideGoal = createRouteRequest(model, START_REF, { row: -1, col: 0, index: -1 });
  assert.equal(outsideGoal.ok, false);
});

test("routeStatusForSelections walks the honest status machine", () => {
  const noStart = routeStatusForSelections(model, null, null);
  assert.equal(noStart.state, "requires-start");

  const noGoal = routeStatusForSelections(model, START_REF, null);
  assert.equal(noGoal.state, "requires-goal");

  const blockedPair = routeStatusForSelections(model, BLOCKED_REF, GOAL_REF);
  assert.equal(blockedPair.state, "endpoints-invalid");
  if (blockedPair.state === "endpoints-invalid") {
    assert.match(blockedPair.detail, /blocked/);
  }

  const validPair = routeStatusForSelections(model, START_REF, GOAL_REF);
  assert.equal(validPair.state, "awaiting-router");
  if (validPair.state === "awaiting-router") {
    assert.deepEqual(validPair.request.start, START_REF);
    assert.deepEqual(validPair.request.goal, GOAL_REF);
    assert.match(validPair.detail, /not calculated|not integrated|no route/i);
  }
});

test("a registered M5 planner is surfaced in the status without faking results", () => {
  const plannerStub: RoutePlanner = {
    id: "test-planner",
    planRoute: async (_request: RouteRequest): Promise<RouteResult> => {
      // A stub is only used here to check the wiring; the app itself never
      // fabricates results.
      return { status: "no-route", detail: "stub" };
    },
  };
  try {
    setRoutePlanner(plannerStub);
    assert.equal(getRoutePlanner()?.id, "test-planner");
    const status = routeStatusForSelections(model, START_REF, GOAL_REF);
    assert.equal(status.state, "awaiting-router");
    if (status.state === "awaiting-router") {
      assert.match(status.detail, /test-planner/);
    }
  } finally {
    setRoutePlanner(null); // restore global state for other tests
  }
  assert.equal(getRoutePlanner(), null);
});

test("toCellRef mirrors the loader cell identity", () => {
  const cell = model.getCell(230, 30);
  const ref = toCellRef(cell);
  assert.deepEqual(ref, { row: 230, col: 30, index: 61_440 });
});
