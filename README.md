# MARS NAVIGATOR

NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map.

Interactive route planning across the Martian surface, using NASA and USGS
terrain data for the Western Fan, Jezero Crater.

## Stack

- React 18 + TypeScript
- Vite 5 (dev server and build)

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
| `npm run check` | Run the routing and coordinate self-checks |
| `npm run data` | Regenerate `public/terrain/navigation_grid.bin` from the M2-02 export |

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

`shortcut:` the search lives here because M1-05, M3-06 and M3-07 cannot be
completed without it. M5's M3-03/M3-04 engine supersedes this at merge time;
the exported signature is kept stable so the swap is a one-file change.

## Limitations

Terrain costs are demonstrative research assumptions, not a validated Mars
safety assessment. The image-to-DEM physical registration and the DEM vertical
datum remain unresolved. The slope threshold and friction model are
uncalibrated.

## Licence

The terrain image and navigation grid are NASA/USGS public-domain products. The
image is credited in the app footer.
