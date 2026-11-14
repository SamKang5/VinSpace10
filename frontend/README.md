# MARS NAVIGATOR — frontend data loader (M2-02 navigation grid)

TypeScript loader for the M2-02 navigation grid export (`Data/navigation/` in
this workspace, originally `exports/M2_02`). It parses and validates
`navigation_grid.json` + `grid_metadata.json` and exposes a verified,
query-ready model for the M1 frontend.

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
npm install        # dev deps: typescript, @types/node (runtime needs no deps)
npm test           # node --test "tests/*.test.ts" (Node 24 native TS runner)
npm run typecheck  # tsc --noEmit
```

Tests are split into synthetic-fixture units (`navigationGrid.test.ts`,
`coordinates.test.ts`) and real-data integration (`integration.test.ts`),
which also verifies the copied assets against the export's `checksums.sha256`
(after line-ending normalization) and exercises the HTTP fetch path with a
local server.

## Data assets

`public/data/M2_02/` holds the served copy of the M2-02 package
(`navigation_grid.json`, `grid_metadata.json`, `checksums.sha256`). The
workspace `.gitattributes` marks this directory `-text` so checkouts never
line-ending-normalize the published bytes (the SHA-256 checksums are
byte-exact). If you refresh the copy from a new export, re-copy all three
files together — the tests will catch any drift or CRLF mangling.
