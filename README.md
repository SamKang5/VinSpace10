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
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |

## Branches

Work on a branch named after the task ID from the team tracker (for example
`m1-02-ctx-orthomosaic`), then open a pull request against `main`. Keep commits
small and reference the task ID in the message.

## Data

Terrain inputs come from NASA and USGS sources: CTX orthomosaic imagery, a
Digital Elevation Model, a derived slope raster, and the USGS geological map for
the Jezero Crater region. The processed navigation grid is exported separately by
the data workstream and is not committed to this repository.

Terrain costs in the demo build are demonstrative and are not a validated Mars
safety assessment.
