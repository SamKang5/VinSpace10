/**
 * Route contract for the future M5 A* router (M1-04 deliverable).
 *
 * This module defines — and the running UI already uses — the typed
 * interface M5 must implement. It contains NO routing implementation and
 * NEVER fabricates a path: until a real planner is registered, the route
 * status is an explicit `awaiting-router` placeholder that renders as
 * "router not integrated". The D07 A* policy (edge cost, heuristic, corner
 * cutting, disconnected regions) lives in `grid_metadata.json`
 * `sourcePolicy.astar` and must be implemented by M5, not by the frontend.
 *
 * M5 integration point: implement {@link RoutePlanner} and hand it to the
 * app (see `setRoutePlanner` / `RouteStatus` rendering in App.tsx).
 */

import type { GridCell } from "../navigationGrid/types.ts";
import type { NavigationGridModel } from "../navigationGrid/navigationGridModel.ts";
import type { GridCellRef } from "../app/selection.ts";

export type { GridCellRef };

/** A validated, traversable endpoint pair ready for the router. */
export interface RouteRequest {
  readonly grid: { readonly width: number; readonly height: number };
  readonly start: GridCellRef;
  readonly goal: GridCellRef;
}

/** Result of a successful router run. `path` always includes both endpoints. */
export interface RouteSuccess {
  readonly status: "ok";
  readonly path: readonly GridCellRef[];
  readonly totalCost: number;
}

/** The router ran and proved no connected route exists between the endpoints. */
export interface RouteNoPath {
  readonly status: "no-route";
  readonly detail: string;
}

/** The router itself failed (must not be presented as "no route"). */
export interface RouteFailure {
  readonly status: "error";
  readonly message: string;
}

export type RouteResult = RouteSuccess | RouteNoPath | RouteFailure;

/** What M5 must implement. `planRoute` must validate its input fail-closed. */
export interface RoutePlanner {
  readonly id: string;
  planRoute(request: RouteRequest): Promise<RouteResult>;
}

/**
 * UI-facing route status. Until a {@link RoutePlanner} is registered, the
 * status for valid endpoint pairs is `awaiting-router` — an explicit,
 * honest placeholder, never a fabricated path.
 */
export type RouteStatus =
  | { readonly state: "requires-start"; readonly detail: string }
  | { readonly state: "requires-goal"; readonly detail: string }
  | { readonly state: "endpoints-invalid"; readonly detail: string }
  | { readonly state: "awaiting-router"; readonly request: RouteRequest; readonly detail: string };

let registeredPlanner: RoutePlanner | null = null;

/** Register the M5 router. Passing null reverts to the awaiting placeholder. */
export function setRoutePlanner(planner: RoutePlanner | null): void {
  registeredPlanner = planner;
}

export function getRoutePlanner(): RoutePlanner | null {
  return registeredPlanner;
}

function isTraversableRef(model: NavigationGridModel, ref: GridCellRef): boolean {
  if (!model.isInside(ref.row, ref.col)) {
    return false;
  }
  return model.isTraversable(ref.row, ref.col);
}

/**
 * Build a typed {@link RouteRequest} from two selected cells, fail-closed:
 * both refs must be in bounds and traversable (supported, unblocked,
 * finite-cost). The returned request carries the grid dimensions M5 needs.
 */
export function createRouteRequest(
  model: NavigationGridModel,
  start: GridCellRef,
  goal: GridCellRef,
): { ok: true; request: RouteRequest } | { ok: false; reason: string } {
  if (!isTraversableRef(model, start)) {
    const cell = model.isInside(start.row, start.col) ? model.getCell(start.row, start.col) : null;
    return {
      ok: false,
      reason:
        cell === null
          ? `Start [${start.row}, ${start.col}] is outside the grid`
          : `Start [${start.row}, ${start.col}] is ${cell.blocked ? "blocked" : "unsupported"}`,
    };
  }
  if (!isTraversableRef(model, goal)) {
    const cell = model.isInside(goal.row, goal.col) ? model.getCell(goal.row, goal.col) : null;
    return {
      ok: false,
      reason:
        cell === null
          ? `Goal [${goal.row}, ${goal.col}] is outside the grid`
          : `Goal [${goal.row}, ${goal.col}] is ${cell.blocked ? "blocked" : "unsupported"}`,
    };
  }
  return {
    ok: true,
    request: {
      grid: { width: model.width, height: model.height },
      start: { ...start },
      goal: { ...goal },
    },
  };
}

/**
 * Compute the UI route status from the current A/B selections. With both
 * endpoints valid this is `awaiting-router` (request attached) until an M5
 * planner is registered; if one is registered, its result is requested.
 */
export function routeStatusForSelections(
  model: NavigationGridModel,
  start: GridCellRef | null,
  goal: GridCellRef | null,
): RouteStatus {
  if (start === null) {
    return { state: "requires-start", detail: "Select a start cell (A): arm Start, then click a traversable cell." };
  }
  if (goal === null) {
    return { state: "requires-goal", detail: "Select a goal cell (B): arm Goal, then click a traversable cell." };
  }
  const request = createRouteRequest(model, start, goal);
  if (!request.ok) {
    return { state: "endpoints-invalid", detail: request.reason };
  }
  const planner = getRoutePlanner();
  if (planner === null) {
    return {
      state: "awaiting-router",
      request: request.request,
      detail: "Endpoints are valid. A* routing is a separate task (M5); no route is calculated or displayed.",
    };
  }
  return {
    state: "awaiting-router",
    request: request.request,
    detail: `Router "${planner.id}" registered; result rendering lands with the M5 integration task.`,
  };
}

/** Narrow helper for cell refs derived from a loader GridCell. */
export function toCellRef(cell: GridCell): GridCellRef {
  return { row: cell.row, col: cell.col, index: cell.index };
}
