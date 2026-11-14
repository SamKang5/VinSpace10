# MARS NAVIGATOR — 30-second demo script (M4-07)

Target: 30 seconds of screen time, spoken track provided.

## Setup before the demo

- Open the deployed URL, press `F11` or hide the browser chrome.
- The app must be on the "Shortest path" mode with no waypoints yet.

## Click sequence

| # | Do this | Say this |
|---|---|---|
| 1 | Click **Use the example route** in the panel. | "This is Jezero Crater's western fan. The blue and orange markers are the start and end of a 5 kilometre traverse." |
| 2 | Click **Calculate route**. | "A* runs on NASA's D07 navigation grid, 267 by 267 cells at 20 metres each." |
| 3 | Point at the two comparison cards. | "Two answers. The blue line is the shortest path — 207 cells. The amber line trades distance for gentler ground — 246 cells, but a lower modelled cost." |
| 4 | Hover a cell on the map. | "Every cell reports its elevation, slope and the friction index the router uses." |
| 5 | Tick **Show slope classes**, then **Show elevation tint**. | "The slope classes and the real elevation raster come from the same pipeline. Red is 15 degrees or more, and the router refuses to cross it." |
| 6 | Tap **How to use** in the header, then close it. | "Three steps, and the whole thing runs in the browser." |

## Captions

- **Slide 1 — the problem.** Planning a rover traverse on Mars means choosing between the shortest line and the gentlest ground, and the ground is not flat.
- **Slide 2 — the data.** NASA CTX orthomosaic over a 267×267 DEM-derived navigation grid, 20 m cells, exported by the team's own D07 pipeline.
- **Slide 3 — the solution.** One A* engine, two objectives, live comparison.
- **Slide 4 — the demo.** (the click sequence above)
- **Slide 5 — the limits.** Friction is a dimensionless index, not energy or time. The 15° cutoff is uncalibrated. Image-to-DEM registration and the DEM vertical datum are unresolved. **A route here is not a safety assessment.**

## Timing

| Segment | Seconds |
|---|---|
| Problem | 4 |
| Data | 6 |
| Solution | 4 |
| Demo | 12 |
| Limits | 4 |
| **Total** | **30** |

## If the network fails

The app is fully static. If the deployed URL is unreachable, run
`npm run build && npx vite preview` and demo from `http://127.0.0.1:4173/`.
