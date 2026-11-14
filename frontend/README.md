# MARS NAVIGATOR — frontend (M1 map + M2-02 navigation grid loader)

React + TypeScript frontend for MARS NAVIGATOR: the interactive Mars map
(M1-02/03/04) built on the verified M2-02 navigation grid loader and the M2-04
imagery package.

**RESEARCH/DEMO DATA — NOT FOR OPERATIONAL MARS NAVIGATION.**

- `cost` is the source's dimensionless per-cell movement friction. It is NOT a
  physical energy, time, speed or safety measurement.
- `validDataMask=1` means image footprint + 3x3 DEM support, not "safe".
- `blockedMask=1` means a data-supported slope hazard class 3 (slope >= 15
  degrees), an illustrative research threshold.
- Unknown (`validDataMask=0`) and blocked (`blockedMask=1`) cells both have
  `cost=null`, are excluded from routing, and must never be filled in.
- Coordinates are Mars 2000 spherical equirectangular PROJECTED metres, not
  WGS84 lon/lat.
- The D07 A* routing policy is documented in the export metadata but is
  deliberately NOT implemented here (M2-03 scope).

## Usage (M1 integration)

```tsx
import { fetchMarsNavigationGrid, type NavigationGridModel } from "./src/navigationGrid/index.ts";

// Data assets live in public/data/M2_02/ and are served at /data/M2_02/.
let model: NavigationGridModel | null = null;
try {
  model = await fetchMarsNavigationGrid("/data/M2_02");
} catch (error) {
  // Fail-closed: invalid or missing data never yields a usable model.
  console.error("Navigation grid unavailable:", error);
}
```

If you already have the two parsed JSON objects (e.g. bundled at build time),
use the sync path: `loadMarsNavigationGrid(rawGrid, rawMetadata)`.

## The app (M1-02/03/04)

`npm run dev` starts Vite (default <http://localhost:5173>); `npm run build`
type-checks and bundles into `dist/`; `npm run preview` serves the bundle.
The app loads both packages at startup and refuses to render unless:

- the navigation grid validates (loader contract, below),
- `imagery_metadata.json` validates (dimensions, 5 m/px affine, bounds/CRS
  identical to the grid, route endpoints consistent with the grid),
- every file in the imagery `checksums.sha256` matches its served bytes and
  the served `grid_metadata.json` hashes to
  `imagery_metadata.navigationGrid.metadataSha256`.

Any failure lands on an error screen with the reason and a retry; nothing is
ever displayed from unverified data.

Map behaviour (implemented in pure modules so it is unit-testable):

- `src/app/mapTransform.ts` — viewport transform (`screen = offset + image *
  scale`), drag panning, cursor-anchored wheel zoom with scale clamping, and
  fit/reset. A CSS resize does not mutate the transform, so image coordinates
  and marker alignment are stable under responsive resizing; only the
  explicit reset refits.
- `src/app/selection.ts` — the M2-03 click contract: image pixel → projected
  metres through the image affine, footprint guard
  (`xmin <= x < xmax`, `ymin < y <= ymax`), floor conversion to `[row, col]`,
  then traversability gating. Out-of-bounds, blocked and unknown clicks are
  rejected with an explanation and are NEVER clamped to the nearest cell.
- `src/app/components/MapViewport.tsx` — pointer/wheel handling and the A/B
  markers. Markers are reprojected from the same transform that draws the
  image, so they cannot drift while panning or zooming.
- Endpoint selection: arm "Set Start (A)" / "Set Goal (B)", then click a
  traversable cell. "Load contract endpoints" selects the handoff's verified
  endpoints (`[230, 30]` at image (122, 922) and `[35, 235]` at (942, 142)).
- Screenshots from the browser smoke test: `docs/screenshots/`.

## M5 router interface (route/contract.ts)

The frontend defines the typed interface M5's A* router must implement. No
routing exists yet and no route is ever fabricated: with valid endpoints the
UI shows an explicit `awaiting-router` placeholder.

```ts
import {
  setRoutePlanner, routeStatusForSelections,
  createRouteRequest,
  type RoutePlanner, type RouteRequest, type RouteResult,
} from "./src/route/index.ts";

// M5 implements:
const planner: RoutePlanner = {
  id: "astar-d07",
  planRoute(request: RouteRequest): Promise<RouteResult> {
    // request.start / request.goal are validated traversable GridCellRefs;
    // request.grid carries {width, height}. Follow the D07 policy in
    // grid_metadata.json sourcePolicy.astar (edge cost = great-circle
    // centre distance x mean endpoint friction, admissible heuristic with
    // minimum friction 1, no diagonal corner cutting, report no-route for
    // disconnected regions).
    // Return { status: "ok", path, totalCost } | { status: "no-route", ... }
    // | { status: "error", ... } — never a fabricated path.
  },
};
setRoutePlanner(planner);
```

`createRouteRequest(model, start, goal)` validates an endpoint pair
fail-closed (both cells in bounds, supported, unblocked, finite cost) and
`routeStatusForSelections(...)` drives the UI status. Until a planner is
registered the status is `awaiting-router` with the typed request attached.

## Model API

| Member | Notes |
| --- | --- |
| `width`, `height`, `grid`, `metadata` | Verified at load; see below |
| `getCell(row, col)` | Full cell: `cost`, `supported`, `blocked`, `traversable` |
| `getCellByIndex(index)` | Same, by flat row-major index |
| `isTraversable(row, col)` | Supported AND not blocked (exactly the finite-cost set) |
| `isInside(row, col)` / `isInsideIndex(index)` | Non-throwing bounds checks |
| `cellIndex(row, col)` / `indexToCell(index)` | `i = row * width + col` and its inverse |
| `cellCenter(row, col)` | Pixel-centre projected metres (README affine, +0.5 convention) |
| `worldToCell(x, y)` | Nearest cell for a projected point (exact on centres) |

All row/col/index accessors throw typed errors on out-of-bounds or
non-integer input: `OutOfBoundsError`, plus `NavigationGridValidationError`
(load-time contract violations) and `SingularAffineError` (degenerate affine)
from `./errors.ts`.

### Footprint boundary semantics

`worldToCell` uses nearest-pixel-centre rounding, with ties toward the larger
index. At the projected footprint edges (for the north-up, axis-aligned
M2-02 export, where the affine cross terms are zero):

- The **west and north edges are included**: the exact corner `(west, north)`
  selects cell `(0, 0)`, and points a hair inside the edge map to the edge
  cells.
- The **east and south edges are excluded**: they project to
  `col == width` / `row == height` and throw `OutOfBoundsError`, as does any
  point beyond them. The outer half-pixel strip maps to the last row/column,
  not out of bounds.

Cell selection is geographic, not a routing decision: `worldToCell` can
return a blocked or unknown cell (for example the blocked north-west corner).
Consumers must fail closed by gating every routing endpoint on
`isTraversable(row, col)` before use; the future router (M2-03) is required
to enforce the same rejection.

Coordinate conversion is exposed only because the verified metadata carries
the full affine + CRS; the loader cross-checks the affine against the declared
bounds and resolution at load time, so a metadata/grid mismatch fails the
load instead of producing silently wrong coordinates.

## Load-time guarantees (fail-closed)

1. `schemaVersion === "1.0"`, known keys only (schema-drift guard).
2. Positive integer dimensions; all three arrays are flat with exactly
   `width * height` elements (row-major; index `i = row * width + col`).
3. Masks are exactly the numbers 0/1 (booleans rejected).
4. Costs are `null` or finite numbers >= 1 (schema-1.0 friction floor).
5. Null semantics: `cost === null` if and only if the cell is unknown or
   blocked; blocked cells are always supported.
6. Grid/metadata agreement: dimensions, recomputed statistics (total,
   supported, unknown, blocked, finiteCost), affine-vs-bounds (1e-6 m),
   axis resolution.

## Development

```bash
npm install        # react + vite (runtime); typescript/@types for checks
npm test           # node --test "tests/*.test.ts" (Node 24 native TS runner)
npm run typecheck  # tsc --noEmit
npm run dev        # Vite dev server
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the production bundle
```

Tests are split into loader suites (`navigationGrid.test.ts`,
`coordinates.test.ts`, `integration.test.ts`) and app suites
(`mapTransform.test.ts`, `selection.test.ts`, `imagery.test.ts`,
`routeContract.test.ts`). All data-touching suites run against the real
served packages, verify checksum manifests, and exercise the HTTP fetch path
with a local server. Component interaction is additionally covered by a
manual browser smoke test (`docs/screenshots/`).

## Data assets

- `public/data/M2_02/` — the M2-02 navigation package (`navigation_grid.json`,
  `grid_metadata.json`, `README.md`, `M2_02_export_report.md`,
  `checksums.sha256`), copied unchanged from `Data/navigation/`.
- `public/data/M2_04/` — the M2-04 imagery package (`mars_terrain.png`,
  `imagery_metadata.json`, `README.md`, `M2_04_validation_report.md`,
  `checksums.sha256`), copied unchanged from the accepted
  `data/m2-04-imagery-handoff` branch.

The workspace `.gitattributes` marks both directories `-text` so checkouts
never line-ending-normalize the published bytes (SHA-256 checksums are
byte-exact). If you refresh a package, re-copy all of its files together —
the tests catch any drift, missing file or CRLF mangling.
