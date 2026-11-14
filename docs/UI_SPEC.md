# Mars Navigator UI specification

## §1 Design thesis

Put route editing on the terrain. The map occupies the full workspace width and the bottom bar holds the two endpoints and both route results. Supplemental data opens on demand. The reference route starts ready for inspection.

## §2 Visual system

| Role | Value |
| --- | --- |
| Ground | #171411 |
| Surface | #221E1A |
| Selected or hover surface | #181512 |
| Decorative line | #474039 |
| Control boundary | #82766A |
| Text | #F6EFE5 |
| Muted text and units | #B7AA9C |
| Error | #FFB19D |
| Focus | #FFFFFF, 2 px |
| Start A and shortest route | #38BDF8, solid |
| End B | #FB923C |
| Terrain-aware route | #F0A9DA, dashed |

Host Grotesk for text. JetBrains Mono for numerical readings. Header 19/22 px at weight 700, 17 px on mobile. Actions 13 px at weight 600, endpoint names 14 px at weight 700. Comparisons 14/20 px and modelled cost 18 px. Label units in muted 10 px mono. Use a 6 px radius, 1 px borders, no drop shadows, and 44 px minimum button height. Icons use 24-unit paths with 1.5 px stroke.

## §3 Layout

```text
800 px and wider
+------------------------------------------------------------+
| Mars Navigator  Jezero Crater              Layers Inspect ? |
+------------------------------------------------------------+
|                                                            |
|                        full-width map                      |
|                                                            |
| scale                                       [ + ][ − ][ ⤢ ]|
+----------------------+-------------------------------------+
| [A Start] [B End]    |                 Distance  Cost Cells|
| [New route] in row   | Shortest          5.58  8113.5  207|
| placement status     | Terrain-aware     6.02  7261.5  246|
+----------------------+-------------------------------------+

375–799 px
+---------------------------------+
| Mars Navigator  Layers Inspect ? |
| Jezero Crater                   |
+---------------------------------+
|                                 |
|         full-width map          |
| scale             [ + ][ − ][⤢] |
+---------------------------------+
| [A Start] [B End] [New route]    |
| placement status                |
| Route        Distance Cost Cells|
| Shortest                        |
| Terrain-aware                   |
|                    More metrics |
+---------------------------------+
```

Use a 100dvh shell with a 56 px heading. The workspace grid uses `minmax(0,1fr) auto` rows. The dock uses `minmax(250px,1fr) minmax(460px,2fr)`, 24 px gap, 8 × 24 px padding, and one thin divider between the groups. The canvas expands into all remaining height. The document never scrolls. The dock can scroll when additional metrics exceed 48dvh. Layers and Inspector have their own internal overflow when open.

## §4 Component specifications

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Loads the decoded imagery and data, seeds the original reference endpoints, validates placement, schedules both searches after a valid pair changes, and owns overlay and inspector state. |
| `src/components/MapViewer.tsx` | Canvas terrain and controls. Pass the parent canvas ref. Use pointer capture. Resolve the closest pin in CSS pixels, render a drag preview, and commit a valid target through the App placement callback. |
| `src/components/ControlPanel.tsx` | A Start and B End are direct-placement controls with a persistent letter and marker colour. New route clears the pair and arms A. Clear cancels an incomplete pair. Only one placement instruction or error is shown. |
| `src/components/RouteComparison.tsx` | Two route rows show distance, modelled cost, and cell count. Route names bring the corresponding line forward. More metrics reveals mean and maximum slope and search time. |
| `src/components/TerrainInfoPanel.tsx` | Cell, elevation, slope, friction, class, projected coordinates and status. Row and column entry also works for placing an armed endpoint. |
| `src/components/MapLegend.tsx` | Layers shows the two toggles, colour scales, grid facts, model limits, and source. |
| `src/components/HowToModal.tsx` | On-demand help for Endpoints, Compare, and Inspect with arrow-key navigation. |
| `src/components/Icon.tsx` | Shared inline help, close, zoom, and fill symbols. |

Show Shortest and Terrain-aware as row labels. Use kilometres with 2 decimals, modelled cost with 1 decimal and unit m × index, integer cells, slope with 1 decimal in degrees, integer milliseconds. For D08, display 5.58 km / 8113.5 / 207 and 6.02 km / 7261.5 / 246. The reference pair is a startup state. It has no separate button or status label.

## §5 The map stage

Draw the 801 × 801 CTX image first, then optional elevation and slope rasters using nearest-neighbour overlay scaling. Draw 1 px grid lines at 6 or more CSS px per grid cell. Draw inactive and then active route with 5 / 7 px dark casing and 2 / 3.5 px colour strokes. Render terrain-aware with dash [9, 6]. Apply inactive alpha .60. Draw A and B last at 13 px radius with their own colours and letter. If both occupy one cell, draw and hit-test them with −12 and +12 px offsets.

Fit the full square raster inside the available viewport on startup. This keeps both reference pins visible at desktop and phone sizes. Fill view remains available for a cropped view. Show only zoom in, zoom out and Fill view at bottom right and projected scale at bottom left. Use a 130 px maximum scale bar. Terrain attribution and overlay keys are in Layers. Route styles are keyed directly in the result rows.

## §6 Motion

Use 120 ms colour transitions on controls, and a 160 ms opacity transition on panel and dialog entry, with `cubic-bezier(.2,.75,.2,1)`. Focus, map transforms, pin movements and results update immediately. Respect reduced motion.

## §7 Interaction & keyboard

- New route arms A immediately. A valid click or tap places A and arms B. The next valid click or tap places B and runs both searches. Grab either existing pin to move it without reselecting it. A drag that starts on bare terrain pans.
- Accept primary pointer drag after more than 3 CSS px along either axis. Use a 17 px mouse hit radius and 22 px touch radius. Preserve the pickup offset. Cancelled pointer input or an outside-image drop ends the preview. A blocked drop restores the working pin and route, with one explanation in the dock.
- The Start and End buttons arm the labelled pin and focus the map. Arrows move one cell. Shift+arrows pan 48 CSS px. Enter inspects or places. Plus, minus and 0 zoom in, zoom out and Fill view. Escape cancels active placement.
- Inspect opens the inspector, focuses its Close button and returns focus to Inspect on close. Tab reaches its coordinate fields. Layers and Inspector open individually. Escape closes the focused panel. Help uses the native modal trap, arrow-key topic selection and focus restoration.
- Clicking a route name reprioritises its stroke. Keyboard focus follows the same DOM order across viewports.

## §8 States

Loading starts with `Loading navigation grid and terrain rasters…` and switches to `Decoding CTX orthomosaic…` when data is decoded. An asset error offers `Retry terrain load` and retains the loader detail. Empty and partial routes display the next placement instruction. `Finding routes…` occupies the comparison area during search. An excluded cell reports the slot and cutoff or data gap in the dock. `No route connects these points. Move either pin.` keeps both pins available for editing.

Layers includes the NASA / USGS source and the research disclosure. Friction is dimensionless, slope-derived, and uncalibrated. It does not measure energy, speed or safety. Both modes exclude cells at 15° or steeper. Physical imagery-to-DEM registration and the vertical datum remain unresolved. [USGS CTX data release](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-context-camera-orthorectified-image-mosaic)

## §9 Responsive behaviour

At 799 px and below, stack the endpoint row over the comparison and use 12 px horizontal dock padding. Move zoom and scale in to 8 px. Stack the app title and location. Give the two panels a maximum width equal to the viewport minus 24 px. In short landscape use reduced vertical dock padding and compact unit headers. The whole workspace stays within the viewport.

## §10 Accessibility

Keep named buttons, visible focus, route and endpoint identity in text and colour, a scoped table, and reduced-motion support. The labelled canvas supports keyboard navigation. The independent Inspector form makes numerical cell selection and endpoint placement accessible without pointing at a map pixel. Announce route results, loader failures, placement messages, and deliberate inspection. Keep pointer hover out of the live region.

## §11 Build notes

Update marker tokens in `src/lib/theme.ts`, adjust canvas interactions and chrome in `src/components/MapViewer.tsx`, then rebuild the dock and panel placement across `src/App.tsx`, `src/components/ControlPanel.tsx`, `src/components/RouteComparison.tsx`, `src/components/TerrainInfoPanel.tsx`, `src/components/HowToModal.tsx`, and `src/styles.css`. No data format, routing engine, service worker, or dependency changes. Run `npm run build` and `npm run check` before publishing. Verify the reference route, two-click placement, pin dragging, blocked drops, mouse and touch panning, keyboard placement, no-route, overlays, asset retry, and offline reload.

## §12 Deliverable

The source implements the full-width workspace, editable pins, automatic route comparison, and on-demand terrain controls. The existing terrain data and route algorithm supply all numerical values.
