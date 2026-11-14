# MARS NAVIGATOR

NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map.

Interactive route planning across the Martian surface, using NASA and USGS
terrain data for the Western Fan, Jezero Crater.

## Stack

- React 18 + TypeScript
- Vite 5 (dev server and build)

**Live: <https://mars-navigator.pages.dev/>**

## Getting started

Requires Node.js 20 or newer.

```bash
git clone https://github.com/SamKang5/VinSpace10.git
cd VinSpace10
npm install
npm run dev
```

The dev server prints its URL (by default <http://localhost:5173>). To build the
production bundle:

```bash
npm run build
npm run preview
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Build the web grid, then start the dev server with hot reload |
| `npm run build` | Build the web grid, type-check, and build the production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run check` | Run the routing and coordinate self-checks, and the unit tests |
| `npm run data` | Regenerate the browser grid and overlay assets from the published exports |

## Branches

Work on a branch named after the task ID from the team tracker (for example
`m1-02-ctx-orthomosaic`), then open a pull request against `main`. Keep commits
small and reference the task ID in the message.

## Data

### Navigation grid (M2-02 export)

`Data/navigation/` holds the published M2-02 export from the D07 Jezero Crater
western-fan pipeline. It is 267 × 267 cells at 20 m spacing, row-major, with
zero-based index `row * 267 + col`.

| File | What it holds |
| --- | --- |
| `navigation_grid.json` | `cost`, `validDataMask` and `blockedMask` arrays |
| `grid_metadata.json` | CRS, affine transform, bounds, source policy, SHA-256 hashes |
| `checksums.sha256` | Checksums for the other package files |
| `README.md` | The TypeScript contract and the routing policy |

`cost` is dimensionless per-cell friction, `1 + (slope_degrees / 10)²`. It is
`null` for both blocked and unknown cells, and both must be excluded from
routing. Unknowns are never filled or interpolated.

The browser loads the grid as a 418 KB binary rather than the 1.5 MB JSON.
`npm run data` regenerates it; it is not tracked in Git.

The app verifies the SHA-256 of each downloaded terrain asset against the
reviewed pins in `src/lib/terrain-pins.ts` before routing or displaying the
image. A mismatch stops loading and offers a retry. `npm run data` also checks
the generated assets against those pins; it never updates them automatically.
For an intentional data update, independently verify the source packages and
generated asset hashes, review the corresponding pin changes alongside the
data changes, and run the integrity tests. The pins assume the application
bundle itself is trusted and must be updated together with the assets.

### Terrain image (M1-02)

`public/terrain/ctx-jezero-aoi.png` is the Jezero Crater western fan cropped from
the USGS Astrogeology CTX orthorectified mosaic used for Mars 2020 Terrain
Relative Navigation:

- Source: `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif`
- SHA-256: `842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615`
- Publisher: USGS Astrogeology Science Center — <doi:10.5066/P9GV1ND3>

The crop is grid-aligned by construction: 3 image pixels cover exactly one
navigation cell, so image pixels convert to grid cells with no residual offset.
`public/terrain/ctx-aoi-meta.json` records that mapping and the source details.

To regenerate the crop from the source GeoTIFF:

```bash
node scripts/crop-ctx-aoi.mjs <source.tif> public/terrain
node scripts/verify-ctx-aoi.mjs <source.tif> public/terrain/ctx-jezero-aoi.png public/terrain/ctx-aoi-meta.json
```

The verify script re-derives the mapping from the TIFF georeferencing
independently of the crop script and checks that the exported pixels match the
source exactly.

### Routing

`src/lib/router.ts` implements the weighted A* search. The edge weight is the
great-circle distance between cell centres times the mean of the two endpoint
frictions, and the heuristic is the great-circle distance to the goal times the
minimum friction of 1, which keeps it admissible. Diagonal corner cutting is
refused, and blocked or unknown cells are never entered.

The engine is a port of the team's own D08 prototype
(`02_Processed_GIS/D08_AStar_Routing/public/routing.js` in the NASA data
archive), so the app and the source pipeline agree by construction. The app
reproduces the D08 published example exactly: 207 cells at modelled cost
8113.5 for the shortest mode and 246 cells at 7261.5 for the terrain-aware mode.

`tests/routing.test.ts` holds the D08 test suite, ported to TypeScript: sample
grids, blocked cells, diagonal corner cuts, unreachable goals, same-point
routes, and a comparison against an independent Dijkstra oracle that shares no
code with the router.

### Overlay rasters (M2-06)

`Data/overlay/` holds the D07 elevation and hazard rasters, copied byte-for-byte
from the NASA archive. `npm run data` copies them into `public/terrain` and
writes `overlay_metadata.json`; the build fails if the rasters drift from the
navigation grid or if the hazard classes disagree with the blocked mask.

### Deployment

The app is a static bundle and is deployed to Cloudflare Pages.

```bash
npm run build
npx wrangler pages deploy dist --project-name mars-navigator
```

Live at <https://mars-navigator.pages.dev/>.

## Limitations

Terrain costs are demonstrative research assumptions, not a validated Mars
safety assessment. The image-to-DEM physical registration and the DEM vertical
datum remain unresolved. The slope threshold and friction model are
uncalibrated.

## Licence

The terrain image and navigation grid are NASA/USGS public-domain products. The
image is credited in the app footer.
